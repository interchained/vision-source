"""Address utilities: classification, scriptPubKey derivation, ElectrumX
script_hash conversion, WIF -> bech32 derivation.

We support:
- Bech32 (itc1...) -> witness v0 keyhash / scripthash
- Legacy P2PKH (addresses starting with prefix bytes)
- Legacy P2SH

The implementations here are dependency-light copies of the helpers from
itc-tools/itsl.py adapted for async backend use.
"""

from __future__ import annotations

import hashlib
from typing import Optional

import base58
import ecdsa

# ITC bech32 human-readable part
HRP_ITC = "itc"

# Legacy address version bytes (Bitcoin Core defaults; ITC may use the same).
# These are placeholders — confirm with the running node before relying on them.
P2PKH_VERSION = 0x00
P2SH_VERSION = 0x05


# ── Bech32 ──
_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _bech32_polymod(values):
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ v
        for i in range(5):
            chk ^= GEN[i] if ((top >> i) & 1) else 0
    return chk


def _bech32_hrp_expand(hrp):
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def _bech32_verify_checksum(hrp, data):
    return _bech32_polymod(_bech32_hrp_expand(hrp) + data) == 1


def _bech32_create_checksum(hrp, data):
    values = _bech32_hrp_expand(hrp) + data
    polymod = _bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]


def _bech32_encode(hrp, data):
    combined = data + _bech32_create_checksum(hrp, data)
    return hrp + "1" + "".join(_BECH32_CHARSET[d] for d in combined)


def _bech32_decode(addr: str):
    if any(ord(c) < 33 or ord(c) > 126 for c in addr):
        return None, None
    addr_lower = addr.lower()
    if "1" not in addr_lower:
        return None, None
    pos = addr_lower.rfind("1")
    if pos < 1 or pos + 7 > len(addr_lower):
        return None, None
    hrp = addr_lower[:pos]
    data = []
    for c in addr_lower[pos + 1:]:
        idx = _BECH32_CHARSET.find(c)
        if idx < 0:
            return None, None
        data.append(idx)
    if not _bech32_verify_checksum(hrp, data):
        return None, None
    return hrp, data[:-6]


def _convertbits(data, frombits, tobits, pad=True):
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            return None
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return ret


def decode_segwit_address(addr: str, expected_hrp: str = HRP_ITC):
    """Return ``(witver, witprog_bytes)`` or ``None`` if invalid."""
    hrp, data = _bech32_decode(addr)
    if hrp != expected_hrp or data is None or len(data) < 1:
        return None
    witver = data[0]
    decoded = _convertbits(data[1:], 5, 8, False)
    if decoded is None or len(decoded) < 2 or len(decoded) > 40:
        return None
    if witver > 16:
        return None
    if witver == 0 and len(decoded) not in (20, 32):
        return None
    return witver, bytes(decoded)


def address_to_script_pubkey(addr: str) -> Optional[bytes]:
    """Return the canonical scriptPubKey bytes for an address."""
    # Try bech32 (segwit)
    decoded = decode_segwit_address(addr)
    if decoded is not None:
        witver, witprog = decoded
        # Witness v0: OP_0 <push>; v1+: OP_1+ <push>
        op = 0x00 if witver == 0 else (0x50 + witver)
        return bytes([op, len(witprog)]) + witprog

    # Try legacy base58check
    try:
        raw = base58.b58decode_check(addr)
    except Exception:
        return None
    if len(raw) != 21:
        return None
    version, payload = raw[0], raw[1:]
    if version == P2PKH_VERSION:
        # OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
        return b"\x76\xa9\x14" + payload + b"\x88\xac"
    if version == P2SH_VERSION:
        # OP_HASH160 <20 bytes> OP_EQUAL
        return b"\xa9\x14" + payload + b"\x87"
    return None


def address_to_script_hash(addr: str) -> Optional[str]:
    """Return the ElectrumX script_hash (hex, little-endian) for an address."""
    spk = address_to_script_pubkey(addr)
    if spk is None:
        return None
    h = hashlib.sha256(spk).digest()
    return h[::-1].hex()


def is_valid_address(addr: str) -> bool:
    return address_to_script_pubkey(addr) is not None


# ── WIF to address (used by deployer when signing client-side is not available) ──
def _ripemd160(data: bytes) -> bytes:
    try:
        h = hashlib.new("ripemd160")
        h.update(data)
        return h.digest()
    except ValueError:
        from Crypto.Hash import RIPEMD160
        r = RIPEMD160.new()
        r.update(data)
        return r.digest()


def get_segwit_address_from_wif(wif: str, hrp: str = HRP_ITC) -> str:
    decoded = base58.b58decode_check(wif)
    privkey_bytes = decoded[1:33]
    is_compressed = len(decoded) == 34 and decoded[33] == 1

    sk = ecdsa.SigningKey.from_string(privkey_bytes, curve=ecdsa.SECP256k1)
    vk = sk.get_verifying_key()
    pub_uncompressed = vk.to_string()
    if is_compressed:
        prefix = b"\x02" if pub_uncompressed[-1] % 2 == 0 else b"\x03"
        pub_final = prefix + pub_uncompressed[:32]
    else:
        pub_final = b"\x04" + pub_uncompressed

    sha = hashlib.sha256(pub_final).digest()
    pkh = _ripemd160(sha)
    witprog = _convertbits(pkh, 8, 5)
    if witprog is None:
        raise ValueError("Invalid witness program")
    return _bech32_encode(hrp, [0] + witprog)
