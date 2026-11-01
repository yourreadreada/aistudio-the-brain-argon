export interface BrainNode {
  id: string;
  label: string;
  category: 'person' | 'company' | 'deal' | 'meeting' | 'commitment';
  subtext: string;
  importance: number; // 1 to 5
  source: 'gmail' | 'calendar' | 'slack' | 'hubspot' | 'notion' | 'linear';
  lastActive: string;
  summary: string;
  details: {
    title: string;
    points: string[];
    timeline: { date: string; event: string; tool: string }[];
    metrics?: { label: string; value: string }[];
  };
  // 2D projection normalized coordinates (-1 to 1)
  x: number;
  y: number;
  connections: string[]; // Node IDs
}

export interface BrainLink {
  source: string;
  target: string;
  relationship: string;
  strength: number; // 0.1 to 1.0
}

export const INITIAL_BRAIN_NODES: BrainNode[] = [
  {
    id: 'elena-rostova',
    label: 'Elena Rostova',
    category: 'person',
    subtext: 'VP Engineering · Stripe',
    importance: 5,
    source: 'gmail',
    lastActive: '18m ago',
    summary: 'Lead stakeholder on Stripe global infrastructure integration. Discussed multi-tenant memory isolation and sub-15ms retrieval SLAs.',
    details: {
      title: 'Elena Rostova — Contact Memory Dossier',
      points: [
        'Confirmed Stripe team wants to roll out Apex autonomous agent to 400 engineers in Q4.',
        'Key blocker resolved: Data retention compliance verified with Cooley LLP counsel.',
        'Next checkpoint scheduled for Friday: Benchmark comparison with Claude 3.7 vs custom fine-tune.',
      ],
      timeline: [
        { date: 'Today 10:14 AM', event: 'Email thread: Re: SLA benchmarks & data partition guarantees', tool: 'Gmail' },
        { date: 'Yesterday 3:30 PM', event: 'Calendar: 45m Technical Architecture Review', tool: 'Calendar' },
        { date: 'Oct 2, 2026', event: 'Slack: Shared draft architecture PDF in #partner-stripe', tool: 'Slack' },
      ],
      metrics: [
        { label: 'Interaction Count', value: '48 threads' },
        { label: 'Sentiment Index', value: '98% positive' },
        { label: 'Decision Authority', value: 'Technical Signoff' },
      ],
    },
    x: -0.42,
    y: -0.28,
    connections: ['stripe', 'series-b', 'sla-agreement', 'board-sync', 'david-kim'],
  },
  {
    id: 'stripe',
    label: 'Stripe',
    category: 'company',
    subtext: 'Enterprise Partner & Customer',
    importance: 5,
    source: 'hubspot',
    lastActive: '42m ago',
    summary: 'Global financial infrastructure provider. Joint development agreement for autonomous transaction reconciliation and merchant telemetry.',
    details: {
      title: 'Stripe Account Overview',
      points: [
        'Contract Status: Enterprise Master Services Agreement under review.',
        'Target ARR: $480,000 / year with tier-1 burst capacity.',
        'Primary contact: Elena Rostova. Secondary: Patrick Collison sync pending.',
      ],
      timeline: [
        { date: 'Today 9:00 AM', event: 'HubSpot: Deal stage moved to Legal / Redline', tool: 'HubSpot' },
        { date: 'Sep 29, 2026', event: 'Calendar: Security & SOC2 Compliance walkthrough', tool: 'Calendar' },
      ],
      metrics: [
        { label: 'Account Tier', value: 'Enterprise Elite' },
        { label: 'Connected Agents', value: '18 instances' },
        { label: 'Security Status', value: 'SOC2 Type II Passed' },
      ],
    },
    x: -0.58,
    y: -0.15,
    connections: ['elena-rostova', 'sla-agreement', 'may-patel'],
  },
  {
    id: 'david-kim',
    label: 'David Kim',
    category: 'person',
    subtext: 'Head of Product · Linear',
    importance: 4,
    source: 'slack',
    lastActive: '2h ago',
    summary: 'Spearheading bidirectional Linear sync so issues and project milestones automatically index into Apex memory without manual tagging.',
    details: {
      title: 'David Kim Dossier',
      points: [
        'Requested API webhooks for instant memory updates upon issue closure.',
        'Collaborating on natural language issue query directly from Slack.',
      ],
      timeline: [
        { date: 'Today 8:12 AM', event: 'Slack DM: Tested webhook endpoint v2 with positive latency', tool: 'Slack' },
        { date: 'Oct 1, 2026', event: 'Linear: Closed milestone 4: Neural issue deduplication', tool: 'Linear' },
      ],
      metrics: [
        { label: 'Sync Health', value: '100% active' },
        { label: 'Synced Issues', value: '1,420 tickets' },
      ],
    },
    x: 0.28,
    y: -0.48,
    connections: ['linear-corp', 'roadmap-review', 'send-benchmark'],
  },
  {
    id: 'linear-corp',
    label: 'Linear',
    category: 'company',
    subtext: 'Issue Tracking & Workflow Partner',
    importance: 4,
    source: 'linear',
    lastActive: '1h ago',
    summary: 'Native integration provider. Real-time issue memory ingestion allowing agents to resolve engineering roadmaps autonomously.',
    details: {
      title: 'Linear Integration',
      points: [
        'Webhooks connected to 12 team repositories.',
        'Autonomous PR review comments activated for high-priority sprints.',
      ],
      timeline: [
        { date: 'Oct 3, 2026', event: 'Linear API token rotated and permissions scoped', tool: 'Linear' },
      ],
    },
    x: 0.48,
    y: -0.55,
    connections: ['david-kim', 'roadmap-review'],
  },
  {
    id: 'marcus-vance',
    label: 'Marcus Vance',
    category: 'person',
    subtext: 'General Partner · Apex Capital',
    importance: 5,
    source: 'calendar',
    lastActive: '3h ago',
    summary: 'Lead investor for Series B funding round. Regularly reviews ARR velocity, memory retention metrics, and enterprise customer expansion.',
    details: {
      title: 'Marcus Vance Dossier',
      points: [
        'Offered $38M term sheet at $240M pre-money valuation.',
        'Requests quarterly cohort retention breakdown prior to syndicate close.',
        'Introduced Apex to 3 Fortune 500 financial institutions last month.',
      ],
      timeline: [
        { date: 'Yesterday 5:00 PM', event: 'Call: Series B syndicate allocation debrief', tool: 'Calendar' },
        { date: 'Oct 1, 2026', event: 'Email: Sent Q3 KPI dashboard & customer NPS results', tool: 'Gmail' },
      ],
      metrics: [
        { label: 'Fund Stake', value: '14.8%' },
        { label: 'Board Seat', value: 'Confirmed (Series A & B)' },
      ],
    },
    x: 0.38,
    y: 0.32,
    connections: ['series-b', 'board-sync', 'founders-fund'],
  },
  {
    id: 'series-b',
    label: 'Series B Term Sheet',
    category: 'deal',
    subtext: '$38M · $240M Valuation · Active',
    importance: 5,
    source: 'notion',
    lastActive: '4h ago',
    summary: 'Primary growth equity round led by Apex Capital with participation from Founders Fund and angel syndicate.',
    details: {
      title: 'Series B Term Sheet Overview',
      points: [
        'Capital Allocation: 60% engineering & GPU compute infrastructure, 30% GTM & enterprise sales, 10% operations.',
        'Legal review progressing with Cooley LLP (Maya Patel lead partner).',
        'Target closing date: October 24, 2026.',
      ],
      timeline: [
        { date: 'Today 1:15 PM', event: 'Notion doc updated: Added revised pro-rata rights clause', tool: 'Notion' },
        { date: 'Sep 27, 2026', event: 'Received signed term sheet letter of intent', tool: 'Gmail' },
      ],
      metrics: [
        { label: 'Round Size', value: '$38,000,000' },
        { label: 'Pre-Money', value: '$240,000,000' },
        { label: 'Closing Date', value: 'Oct 24, 2026' },
      ],
    },
    x: 0.18,
    y: 0.22,
    connections: ['marcus-vance', 'may-patel', 'board-sync'],
  },
  {
    id: 'board-sync',
    label: 'Board Strategy Sync',
    category: 'meeting',
    subtext: 'Bi-Weekly Executive Session · Oct 2',
    importance: 4,
    source: 'calendar',
    lastActive: 'Yesterday',
    summary: 'Executive sync covering enterprise pipeline, autonomous business agent execution rate, and compute margin optimizations.',
    details: {
      title: 'Board Strategy Sync Transcript Highlights',
      points: [
        'Recorded 99.4% context accuracy on cross-tool memory queries.',
        'Approved expansion into APAC regional hosting nodes for lower inference latency.',
        'Action item: Deliver multi-tenant partition architecture doc before Friday.',
      ],
      timeline: [
        { date: 'Yesterday 2:00 PM', event: 'Meeting concluded (65 min). AI transcript indexed into The Brain', tool: 'Calendar' },
      ],
    },
    x: 0.04,
    y: 0.08,
    connections: ['marcus-vance', 'series-b', 'elena-rostova', 'deliver-architecture'],
  },
  {
    id: 'may-patel',
    label: 'Maya Patel',
    category: 'person',
    subtext: 'Lead Partner · Cooley LLP',
    importance: 4,
    source: 'gmail',
    lastActive: '5h ago',
    summary: 'Corporate counsel handling enterprise master services agreements, Series B definitive agreements, and international privacy posture.',
    details: {
      title: 'Maya Patel Dossier',
      points: [
        'Approved language for data isolation guarantee in enterprise contracts.',
        'Currently revising Section 4.2 of Stripe MSA regarding GDPR cross-border memory caching.',
      ],
      timeline: [
        { date: 'Today 7:45 AM', event: 'Gmail: Sent redlined MSA contract v3 to Stripe legal', tool: 'Gmail' },
      ],
    },
    x: -0.25,
    y: 0.42,
    connections: ['stripe', 'series-b', 'sla-agreement', 'review-msa'],
  },
  {
    id: 'sla-agreement',
    label: 'Enterprise SLA & MSA',
    category: 'deal',
    subtext: 'Stripe · $480K ARR · In Final Review',
    importance: 5,
    source: 'hubspot',
    lastActive: '6h ago',
    summary: 'Flagship enterprise contract covering 99.99% uptime, 50ms agent turnaround, and encrypted zero-knowledge business memory store.',
    details: {
      title: 'Enterprise Master Services Agreement',
      points: [
        'Includes dedicated single-tenant memory cluster with hardware security modules.',
        'Annual prepayment term with 30-day onboarding window.',
      ],
      timeline: [
        { date: 'Today 11:30 AM', event: 'HubSpot: Legal approval stage confirmed by Maya Patel', tool: 'HubSpot' },
      ],
    },
    x: -0.45,
    y: 0.12,
    connections: ['stripe', 'elena-rostova', 'may-patel'],
  },
  {
    id: 'roadmap-review',
    label: 'Roadmap & Agent Review',
    category: 'meeting',
    subtext: 'Product Sync · Yesterday 4:00 PM',
    importance: 3,
    source: 'calendar',
    lastActive: 'Yesterday',
    summary: 'Reviewed upcoming features: deep neural graph clustering, voice memory capture, and autonomous meeting follow-up generator.',
    details: {
      title: 'Product Roadmap Sync Summary',
      points: [
        'Autonomous follow-ups reduce executive email overhead by 78%.',
        'Next sprint targets real-time calendar agenda reconciliation.',
      ],
      timeline: [
        { date: 'Yesterday 4:00 PM', event: 'Calendar: 50m recorded session with product & engineering leads', tool: 'Calendar' },
      ],
    },
    x: 0.12,
    y: -0.38,
    connections: ['david-kim', 'send-benchmark'],
  },
  {
    id: 'send-benchmark',
    label: 'Send latency benchmark',
    category: 'commitment',
    subtext: 'Due Today 6:00 PM · to Elena Rostova',
    importance: 4,
    source: 'slack',
    lastActive: '12m ago',
    summary: 'Commitment detected from morning Slack conversation: compile sub-15ms vector retrieval report and share with Stripe engineering.',
    details: {
      title: 'Commitment Action Item',
      points: [
        'Status: In progress (90% completed).',
        'Attachment: benchmark_v2_sept2026.pdf prepared.',
        'Target recipient: Elena Rostova <elena@stripe.com>',
      ],
      timeline: [
        { date: 'Today 10:18 AM', event: 'Slack: Promised delivery before EOD', tool: 'Slack' },
      ],
    },
    x: -0.22,
    y: -0.42,
    connections: ['elena-rostova', 'david-kim', 'roadmap-review'],
  },
  {
    id: 'deliver-architecture',
    label: 'Deliver multi-tenant doc',
    category: 'commitment',
    subtext: 'Due Friday · to Board & Marcus Vance',
    importance: 4,
    source: 'notion',
    lastActive: '1h ago',
    summary: 'Executive commitment created from Board Strategy Sync: document data fencing protocols and tenant-keyed cryptographic isolation.',
    details: {
      title: 'Commitment Action Item',
      points: [
        'Document draft initialized in Notion: /apex/security/multi-tenant-spec',
        'Security architect reviewed encryption layer; pending final signoff.',
      ],
      timeline: [
        { date: 'Yesterday 2:45 PM', event: 'Extracted automatically from meeting recording', tool: 'Notion' },
      ],
    },
    x: 0.25,
    y: 0.12,
    connections: ['board-sync', 'marcus-vance'],
  },
  {
    id: 'review-msa',
    label: 'Review Section 4.2 of MSA',
    category: 'commitment',
    subtext: 'Due Tomorrow · with Maya Patel',
    importance: 3,
    source: 'gmail',
    lastActive: '4h ago',
    summary: 'Legal commitment: approve data residency clause allowing customer memory nodes to reside within EU data boundaries.',
    details: {
      title: 'Commitment Action Item',
      points: [
        'Requested by Stripe legal team.',
        'Maya Patel flagged no legal impediments; requires engineering confirmation.',
      ],
      timeline: [
        { date: 'Today 8:00 AM', event: 'Gmail thread flagged with high priority', tool: 'Gmail' },
      ],
    },
    x: -0.32,
    y: 0.32,
    connections: ['may-patel', 'sla-agreement'],
  },
  {
    id: 'founders-fund',
    label: 'Founders Fund',
    category: 'company',
    subtext: 'Venture Syndicate Co-Investor',
    importance: 4,
    source: 'gmail',
    lastActive: '1d ago',
    summary: 'Series A syndicate partner participating with $12M pro-rata in Series B round.',
    details: {
      title: 'Founders Fund Partner Dossier',
      points: [
        'Partner: Brian Singerman.',
        'Continuous support for autonomous intelligence operating systems.',
      ],
      timeline: [
        { date: 'Oct 1, 2026', event: 'Signed pro-rata affirmation letter', tool: 'Gmail' },
      ],
    },
    x: 0.55,
    y: 0.45,
    connections: ['marcus-vance', 'series-b'],
  },
];

export const CATEGORY_COLORS: Record<BrainNode['category'], { fill: string; stroke: string; text: string; bg: string }> = {
  person: {
    fill: '#9db4ff',
    stroke: 'rgba(157, 180, 255, 0.45)',
    text: '#9db4ff',
    bg: 'rgba(157, 180, 255, 0.12)',
  },
  company: {
    fill: '#a5f3fc',
    stroke: 'rgba(165, 243, 252, 0.45)',
    text: '#67e8f9',
    bg: 'rgba(165, 243, 252, 0.12)',
  },
  deal: {
    fill: '#fed7aa',
    stroke: 'rgba(254, 215, 170, 0.45)',
    text: '#fdba74',
    bg: 'rgba(254, 215, 170, 0.12)',
  },
  meeting: {
    fill: '#c4b5fd',
    stroke: 'rgba(196, 181, 253, 0.45)',
    text: '#c4b5fd',
    bg: 'rgba(196, 181, 253, 0.12)',
  },
  commitment: {
    fill: '#86efac',
    stroke: 'rgba(134, 239, 172, 0.45)',
    text: '#86efac',
    bg: 'rgba(134, 239, 172, 0.12)',
  },
};

export const INTEGRATION_TOOLS = [
  { id: 'gmail', name: 'Gmail', count: '14,280 messages', status: 'Synced 3m ago' },
  { id: 'calendar', name: 'Google Calendar', count: '482 events', status: 'Synced 6m ago' },
  { id: 'slack', name: 'Slack', count: '32 channels', status: 'Live WebSocket' },
  { id: 'hubspot', name: 'HubSpot CRM', count: '1,240 contacts', status: 'Synced 12m ago' },
  { id: 'notion', name: 'Notion', count: '94 docs indexed', status: 'Synced 1h ago' },
  { id: 'linear', name: 'Linear', count: '1,420 issues', status: 'Synced 20m ago' },
];
