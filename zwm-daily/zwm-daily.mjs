/**
 * ZWM Daily 10x Brief Generator
 *
 * Calls the Anthropic API with web search to research latest industry
 * developments, identifies one grounded 10x improvement for the Zuup
 * World Model, and outputs a formatted DOCX brief.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node zwm-daily.mjs
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableRow, TableCell, Table,
  WidthType, ShadingType, Footer, Header,
} from 'docx';
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const CLAUDE_MD_PATH = join(__dirname, '..', 'CLAUDE.md');
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const MODEL = process.env.ZWM_MODEL || 'claude-sonnet-4-6';

// ZWM brand colors
const TEAL = '1D9E75';
const PURPLE = '7F77DD';
const AMBER = 'EF9F27';
const DARK = '0A0A0A';
const MUTED = '888880';

// ---------------------------------------------------------------------------
// ZWM Context (read from CLAUDE.md or fallback)
// ---------------------------------------------------------------------------

function loadZwmContext() {
  if (existsSync(CLAUDE_MD_PATH)) {
    const raw = readFileSync(CLAUDE_MD_PATH, 'utf-8');
    // Extract key sections — keep it under ~3000 tokens for the system prompt
    const sections = [];

    // Platform summary
    const repoMapMatch = raw.match(/## Repo Map[\s\S]*?(?=\n---)/);
    if (repoMapMatch) sections.push(repoMapMatch[0].slice(0, 800));

    // Causal rules table
    const causalMatch = raw.match(/## Causal Propagation Rules[\s\S]*?(?=\n---)/);
    if (causalMatch) sections.push(causalMatch[0].slice(0, 1200));

    // Benchmarks
    const benchMatch = raw.match(/## Platform Benchmark Reference[\s\S]*?(?=\n---)/);
    if (benchMatch) sections.push(benchMatch[0].slice(0, 800));

    // Build phase
    const phaseMatch = raw.match(/## Build Sequence[\s\S]*?(?=\n---)/);
    if (phaseMatch) sections.push(phaseMatch[0].slice(0, 600));

    if (sections.length > 0) return sections.join('\n\n');
  }

  // Fallback if CLAUDE.md is missing
  return `The Zuup World Model (ZWM) is an integration layer connecting nine Solana-deployed platforms
into a single causally-coherent world model via a Neo4j append-only graph:
- Civium (compliance/halal/ESG/ITAR) — W3C VC 2.0 + EPCIS 2.0
- Aureon (procurement) — FitIQ scoring, APP-Bench NDCG@20
- QAL (historical reconstruction) — QAWM fidelity, temporal risk
- Symbion (biological monitoring) — serotonin/dopamine/cortisol/GABA
- Relian (code migration) — semantic preservation, auto-attestation
- PodX (edge compute) — XdoP/WCBI scoring, DDIL resilience
- Veyra (reasoning/intelligence) — V-Score, Claude API integration
- ZUSDC (settlement) — 1:1 USDC collateralized, atomic mint/burn
- ZuupHQ (attestation) — SHA256 content-addressed, on-chain trust

Stack: TypeScript, Node.js, @coral-xyz/anchor, @solana/web3.js, neo4j-driver, Apollo GraphQL.
Current phase: 2A (Emit side — adding Anchor events to each platform).
Revenue model: Enterprise API access, platform partnerships, institutional licensing.`;
}

// ---------------------------------------------------------------------------
// System & User Prompts
// ---------------------------------------------------------------------------

const ZWM_CONTEXT = loadZwmContext();

const SYSTEM_PROMPT = `You are the ZWM Strategic Intelligence Engine. Your job is to research
the latest real-world developments and identify ONE specific, grounded improvement that would
10x the Zuup World Model in efficiency, functionality, adaptability, or real financial earnings.

Here is the current ZWM architecture and status:

${ZWM_CONTEXT}

RULES:
- Every claim must be grounded in verifiable, current developments (use web search).
- Improvements must be specific to ZWM's architecture — not generic AI advice.
- Each improvement must connect to a real financial outcome (revenue, cost reduction, or market position).
- Use cases must name real companies and real outcomes (not hypothetical).
- Write in simplified, accessible language — no jargon without explanation.`;

const USER_PROMPT = `Today is ${TODAY}. Search the web for the latest developments in:
1. World models (AI world models, physical simulation, causal reasoning systems)
2. Institutional AI and enterprise AI platforms
3. Solana ecosystem (DeFi, DePIN, institutional adoption, program tooling)
4. Causal graph databases and knowledge graph systems
5. Compliance automation (supply chain, halal, ESG, ITAR)
6. Edge compute and distributed systems
7. Supply chain AI and procurement intelligence

Based on what you find, identify ONE specific 10x improvement for ZWM.

Return your response as a JSON object with exactly this structure:
{
  "whats_new": [
    { "headline": "...", "detail": "...", "source_url": "..." }
  ],
  "ten_x_improvement": {
    "title": "...",
    "summary": "One paragraph explaining the improvement in plain language",
    "affected_platforms": ["civium", "aureon", ...],
    "implementation_steps": ["Step 1...", "Step 2...", ...],
    "thirty_day_plan": {
      "week_1": "...",
      "week_2": "...",
      "week_3": "...",
      "week_4": "..."
    },
    "financial_impact": "How this connects to real revenue or cost savings"
  },
  "research_backing": [
    { "title": "...", "detail": "...", "url": "..." }
  ],
  "use_cases": {
    "successful": [
      { "company": "...", "what_they_did": "...", "outcome": "..." }
    ],
    "failed": [
      { "company": "...", "what_they_did": "...", "outcome": "..." }
    ]
  }
}

IMPORTANT: Return ONLY the JSON object. No markdown fences, no extra text.
Ensure "successful" has exactly 2 entries and "failed" has exactly 2 entries.
"whats_new" should have 3-5 entries. "research_backing" should have 2-4 entries.`;

// ---------------------------------------------------------------------------
// Phase A: Research via Anthropic API + Web Search
// ---------------------------------------------------------------------------

async function research() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[zwm-daily] ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('  Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log(`[zwm-daily] Starting research phase — model: ${MODEL}, date: ${TODAY}`);

  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: USER_PROMPT }],
      });
      break;
    } catch (err) {
      if (attempt === 0) {
        console.warn(`[zwm-daily] API call failed (attempt 1): ${err.message}. Retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        console.error(`[zwm-daily] API call failed after 2 attempts: ${err.message}`);
        process.exit(1);
      }
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
// Phase B: Parse Response
// ---------------------------------------------------------------------------

function parseResponse(response) {
  // Extract text blocks from the response content
  const textBlocks = response.content.filter((b) => b.type === 'text');
  const fullText = textBlocks.map((b) => b.text).join('\n');

  // Try to find JSON in the response
  let json;
  try {
    json = JSON.parse(fullText.trim());
  } catch {
    // Try extracting JSON from markdown code fences
    const fenceMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      json = JSON.parse(fenceMatch[1].trim());
    } else {
      // Try finding the first { ... } block
      const braceMatch = fullText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        json = JSON.parse(braceMatch[0]);
      } else {
        throw new Error('Could not extract JSON from API response');
      }
    }
  }

  // Validate required fields
  const required = ['whats_new', 'ten_x_improvement', 'research_backing', 'use_cases'];
  for (const field of required) {
    if (!json[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return json;
}

// ---------------------------------------------------------------------------
// Phase C: Generate DOCX
// ---------------------------------------------------------------------------

function getBriefNumber() {
  if (!existsSync(OUTPUT_DIR)) return 1;
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.startsWith('ZWM_Daily_Brief_') && f.endsWith('.docx'));
  return files.length + 1;
}

function buildDocx(data) {
  const briefNum = getBriefNumber();

  // Helper: create a styled section heading
  const sectionHeading = (text, num) =>
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({ text: `${num}. `, bold: true, size: 28, color: TEAL, font: 'Calibri' }),
        new TextRun({ text, bold: true, size: 28, color: TEAL, font: 'Calibri' }),
      ],
    });

  // Helper: body paragraph
  const bodyPara = (text, options = {}) =>
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text,
          size: 22,
          font: 'Calibri',
          color: options.color || '333333',
          bold: options.bold || false,
          italics: options.italic || false,
        }),
      ],
    });

  // Helper: bullet point
  const bullet = (text) =>
    new Paragraph({
      spacing: { after: 80 },
      bullet: { level: 0 },
      children: [new TextRun({ text, size: 22, font: 'Calibri', color: '333333' })],
    });

  // Helper: numbered item
  const numberedItem = (num, text) =>
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${num}. `, bold: true, size: 22, font: 'Calibri', color: TEAL }),
        new TextRun({ text, size: 22, font: 'Calibri', color: '333333' }),
      ],
    });

  // Helper: horizontal rule
  const horizontalRule = () =>
    new Paragraph({
      spacing: { before: 200, after: 200 },
      border: { bottom: { color: MUTED, style: BorderStyle.SINGLE, size: 1, space: 1 } },
      children: [],
    });

  // Helper: source citation
  const sourceLine = (url) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Source: ', size: 18, font: 'Courier New', color: MUTED, italics: true }),
        new TextRun({ text: url, size: 18, font: 'Courier New', color: PURPLE, italics: true }),
      ],
    });

  // Helper: use case block
  const useCaseBlock = (label, cases, color) => {
    const items = [];
    items.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: label, bold: true, size: 24, color, font: 'Calibri' })],
      })
    );
    for (const c of cases) {
      items.push(bodyPara(`${c.company}`, { bold: true }));
      items.push(bodyPara(`What they did: ${c.what_they_did}`));
      items.push(bodyPara(`Outcome: ${c.outcome}`, { italic: true }));
      items.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    }
    return items;
  };

  // Build the 30-day plan table
  const thirtyDayPlan = data.ten_x_improvement.thirty_day_plan || {};
  const planTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ['Week', 'Focus'].map(
          (text) =>
            new TableCell({
              shading: { type: ShadingType.SOLID, color: TEAL },
              children: [
                new Paragraph({
                  children: [new TextRun({ text, bold: true, size: 20, color: 'FFFFFF', font: 'Calibri' })],
                }),
              ],
            })
        ),
      }),
      ...['week_1', 'week_2', 'week_3', 'week_4'].map(
        (key, i) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: `Week ${i + 1}`, bold: true, size: 20, font: 'Calibri' })],
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: thirtyDayPlan[key] || '—', size: 20, font: 'Calibri' })],
                  }),
                ],
              }),
            ],
          })
      ),
    ],
  });

  // Assemble document sections
  const children = [];

  // Title block
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'ZUUP INNOVATION LAB',
          bold: true,
          size: 18,
          font: 'Courier New',
          color: MUTED,
          allCaps: true,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'ZWM Daily 10x Brief', bold: true, size: 40, color: TEAL, font: 'Calibri' }),
      ],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `Brief #${briefNum}  ·  ${TODAY}`, size: 22, color: MUTED, font: 'Courier New' }),
      ],
    })
  );
  children.push(horizontalRule());

  // Section 1: What's New?
  children.push(sectionHeading("What's New?", 1));
  for (const item of data.whats_new || []) {
    children.push(bodyPara(item.headline, { bold: true }));
    children.push(bodyPara(item.detail));
    if (item.source_url) children.push(sourceLine(item.source_url));
    children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  }
  children.push(horizontalRule());

  // Section 2: How did we 10x ZWM today?
  children.push(sectionHeading('How did we 10x ZWM today?', 2));
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: data.ten_x_improvement.title,
          bold: true,
          size: 30,
          color: PURPLE,
          font: 'Calibri',
        }),
      ],
    })
  );
  children.push(bodyPara(data.ten_x_improvement.summary));

  // Affected platforms
  const platforms = (data.ten_x_improvement.affected_platforms || []).join(', ');
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun({ text: 'Affected platforms: ', bold: true, size: 22, font: 'Calibri', color: '333333' }),
        new TextRun({ text: platforms, size: 22, font: 'Courier New', color: AMBER }),
      ],
    })
  );

  // Implementation steps
  children.push(bodyPara('Implementation Steps:', { bold: true }));
  for (let i = 0; i < (data.ten_x_improvement.implementation_steps || []).length; i++) {
    children.push(numberedItem(i + 1, data.ten_x_improvement.implementation_steps[i]));
  }

  // Financial impact
  children.push(
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({ text: 'Financial Impact: ', bold: true, size: 22, font: 'Calibri', color: TEAL }),
        new TextRun({ text: data.ten_x_improvement.financial_impact, size: 22, font: 'Calibri', color: '333333' }),
      ],
    })
  );

  // 30-day plan table
  children.push(bodyPara('30-Day Action Plan:', { bold: true }));
  children.push(planTable);
  children.push(horizontalRule());

  // Section 3: Research Backing
  children.push(sectionHeading('What grounded research backs the 10x improvement(s)?', 3));
  for (let i = 0; i < (data.research_backing || []).length; i++) {
    const r = data.research_backing[i];
    children.push(numberedItem(i + 1, `${r.title}`));
    children.push(bodyPara(r.detail));
    if (r.url) children.push(sourceLine(r.url));
    children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  }
  children.push(horizontalRule());

  // Section 4: Use Cases
  children.push(sectionHeading('What are other current use cases for these improvements?', 4));
  children.push(...useCaseBlock('Successful Implementations', data.use_cases?.successful || [], TEAL));
  children.push(...useCaseBlock('Failed Implementations', data.use_cases?.failed || [], 'CC3333'));

  // Create document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '333333' },
        },
      },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'ZWM Daily 10x Brief', size: 16, color: MUTED, font: 'Courier New' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Zuup Innovation Lab · "Where Ideas Collapse Into Reality"',
                    size: 16,
                    color: MUTED,
                    font: 'Courier New',
                    italics: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Generated ${new Date().toISOString()} · khaaliswooden@gmail.com · zuup.org`,
                    size: 14,
                    color: MUTED,
                    font: 'Courier New',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return doc;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[zwm-daily] ===== ZWM Daily 10x Brief — ${TODAY} =====`);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  // Phase A: Research
  const response = await research();
  console.log(`[zwm-daily] Research complete — ${response.usage?.input_tokens || '?'} input tokens, ${response.usage?.output_tokens || '?'} output tokens`);

  // Phase B: Parse
  let data;
  try {
    data = parseResponse(response);
    console.log(`[zwm-daily] Parsed brief: "${data.ten_x_improvement?.title}"`);
  } catch (err) {
    console.error(`[zwm-daily] Failed to parse response: ${err.message}`);
    // Write raw response as fallback
    const fallbackPath = join(OUTPUT_DIR, `ZWM_Daily_Brief_${TODAY}_RAW.json`);
    const textBlocks = response.content.filter((b) => b.type === 'text');
    writeFileSync(fallbackPath, JSON.stringify({ content: textBlocks, usage: response.usage }, null, 2));
    console.error(`[zwm-daily] Raw response saved to: ${fallbackPath}`);
    process.exit(1);
  }

  // Phase C: Generate DOCX
  const doc = buildDocx(data);
  const buffer = await Packer.toBuffer(doc);
  const outputPath = join(OUTPUT_DIR, `ZWM_Daily_Brief_${TODAY}.docx`);
  writeFileSync(outputPath, buffer);

  console.log(`[zwm-daily] DOCX written to: ${outputPath}`);
  console.log(`[zwm-daily] Brief: "${data.ten_x_improvement?.title}"`);
  console.log(`[zwm-daily] Platforms affected: ${(data.ten_x_improvement?.affected_platforms || []).join(', ')}`);
  console.log(`[zwm-daily] Done.`);
}

main().catch((err) => {
  console.error(`[zwm-daily] Fatal error: ${err.message}`);
  process.exit(1);
});
