'use client';

import Link from 'next/link';
import { formatItc } from '@/lib/format';
import { shortHash } from '@/lib/utils';

interface TxInput {
  coinbase?: string;
  txid?: string;
  vout?: number;
  prevout?: { address?: string; value_sats?: number };
}

interface TxOutput {
  n: number;
  address?: string;
  value_sats: number;
  script_pubkey_type?: string;
}

interface Props {
  tx: {
    txid: string;
    is_coinbase?: boolean;
    inputs: TxInput[];
    outputs: TxOutput[];
    fee_sats?: number;
  };
}

const PADDING = 20;
const ROW_H = 36;
const COL_W = 200;
const CENTER_GAP = 80;
const MIN_H = 120;

export function TxFlowDiagram({ tx }: Props) {
  const inputs = tx.inputs;
  const outputs = tx.outputs;

  const rows = Math.max(inputs.length, outputs.length, 1);
  const svgH = Math.max(MIN_H, rows * ROW_H + PADDING * 2);
  const svgW = COL_W * 2 + CENTER_GAP + PADDING * 2;

  const totalIn = inputs.reduce((s, i) => s + (i.prevout?.value_sats ?? 0), 0);
  const totalOut = outputs.reduce((s, o) => s + o.value_sats, 0);
  const maxVal = Math.max(totalIn, totalOut, 1);

  function cy(idx: number, total: number) {
    const span = (total - 1) * ROW_H;
    const start = (svgH - span) / 2;
    return start + idx * ROW_H;
  }

  const inputX = PADDING + COL_W;
  const outputX = PADDING + COL_W + CENTER_GAP;
  const midX = (inputX + outputX) / 2;

  const inputPoints = inputs.map((_, i) => ({ x: inputX, y: cy(i, inputs.length) }));
  const outputPoints = outputs.map((_, i) => ({ x: outputX, y: cy(i, outputs.length) }));

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-white">Value Flow</h3>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={svgW}
          height={svgH}
          className="block mx-auto"
          style={{ minWidth: svgW }}
        >
          {/* Connection lines */}
          {inputPoints.map((ip, ii) => {
            const inVal = inputs[ii].prevout?.value_sats ?? (tx.is_coinbase ? totalOut : 0);
            return outputPoints.map((op, oi) => {
              const outVal = outputs[oi].value_sats;
              const weight = maxVal > 0 ? ((inVal + outVal) / 2 / maxVal) : 0.2;
              const strokeW = Math.max(1, weight * 8);
              return (
                <path
                  key={`${ii}-${oi}`}
                  d={`M ${ip.x} ${ip.y} C ${midX} ${ip.y}, ${midX} ${op.y}, ${op.x} ${op.y}`}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={strokeW}
                  opacity={0.15 + weight * 0.25}
                />
              );
            });
          })}

          {/* Input nodes */}
          {inputs.map((inp, i) => {
            const { x, y } = inputPoints[i];
            const addr = inp.prevout?.address;
            const val = inp.prevout?.value_sats;
            const isCoinbase = !!inp.coinbase;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill={isCoinbase ? 'var(--color-gold)' : 'var(--color-accent)'}
                  opacity={0.9}
                />
                {/* Label left of node */}
                <text
                  x={x - 12}
                  y={y - 6}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--color-text-dim)"
                  fontFamily="monospace"
                >
                  {isCoinbase ? 'COINBASE' : addr ? shortHash(addr, 5, 4) : 'unknown'}
                </text>
                {val !== undefined && (
                  <text
                    x={x - 12}
                    y={y + 10}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--color-gold)"
                    fontFamily="monospace"
                  >
                    {formatItc(val)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Output nodes */}
          {outputs.map((out, i) => {
            const { x, y } = outputPoints[i];
            const isChange = out.address && inputs.some((inp) => inp.prevout?.address === out.address);
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill={isChange ? 'var(--color-text-faint)' : 'var(--color-success)'}
                  opacity={0.9}
                />
                <text
                  x={x + 12}
                  y={y - 6}
                  textAnchor="start"
                  fontSize="9"
                  fill={isChange ? 'var(--color-text-faint)' : 'var(--color-text-dim)'}
                  fontFamily="monospace"
                >
                  {out.address ? shortHash(out.address, 5, 4) : out.script_pubkey_type || 'OP_RETURN'}
                </text>
                <text
                  x={x + 12}
                  y={y + 10}
                  textAnchor="start"
                  fontSize="9"
                  fill="var(--color-gold)"
                  fontFamily="monospace"
                >
                  {formatItc(out.value_sats)}
                </text>
              </g>
            );
          })}

          {/* Column labels */}
          <text x={PADDING + COL_W / 2} y={14} textAnchor="middle" fontSize="9" fill="var(--color-text-faint)" fontFamily="sans-serif" fontWeight="600" letterSpacing="1">
            INPUTS ({inputs.length})
          </text>
          <text x={svgW - PADDING - COL_W / 2} y={14} textAnchor="middle" fontSize="9" fill="var(--color-text-faint)" fontFamily="sans-serif" fontWeight="600" letterSpacing="1">
            OUTPUTS ({outputs.length})
          </text>

          {/* Fee label at center */}
          {tx.fee_sats !== undefined && tx.fee_sats !== null && !tx.is_coinbase && (
            <>
              <text x={midX} y={svgH - 8} textAnchor="middle" fontSize="9" fill="var(--color-text-faint)" fontFamily="monospace">
                Fee: {formatItc(tx.fee_sats)}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Address links below diagram */}
      <div className="px-5 pb-3 pt-1 flex gap-6 flex-wrap">
        <div className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-accent)]" /> Input
        </div>
        <div className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)]" /> Output
        </div>
        <div className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--color-text-faint)' }} /> Change
        </div>
        {tx.is_coinbase && (
          <div className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-gold)]" /> Coinbase
          </div>
        )}
      </div>
    </div>
  );
}
