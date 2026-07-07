/**
 * Enrichment layer: takes a business name + optional URL and returns the
 * fields the system_prompt templates consume. Real production builds would
 * hit Clay / Google Maps / website scrape; this module ships a heuristic
 * scraper + mock fallback so the pipeline runs deterministically without
 * external credentials. Replace the `fetchWebsiteText` call with the real
 * crawl when this lands inside ElevenLabs.
 */

import type {EnrichmentResult, EnrichmentSource} from './types';

const VERTICAL_HEURISTICS: Array<{
  pattern: RegExp;
  category: string;
  vertical_label: string;
}> = [
  {pattern: /\b(heating|hvac|furnace|air condition|cooling|plumb|electric|garage door|roofing)\b/i, category: 'hvac', vertical_label: 'HVAC / home services'},
  {pattern: /\b(dental|dentist|orthodont|smile|teeth)\b/i, category: 'dental', vertical_label: 'dental practice'},
  {pattern: /\b(restaurant|cafe|kitchen|grill|bistro|pizzeria|bar)\b/i, category: 'restaurant', vertical_label: 'restaurant'},
  {pattern: /\b(law|attorney|legal|injury|firm|esq\.?|paralegal)\b/i, category: 'legal', vertical_label: 'law firm'},
  {pattern: /\b(clinic|physician|doctor|medical|chiro|physical therapy)\b/i, category: 'dental', vertical_label: 'medical practice'},
  {pattern: /\b(catering|caterer)\b/i, category: 'restaurant', vertical_label: 'catering business'},
];

const MOCK_FIXTURES: Record<string, EnrichmentResult> = {
  riverside: {
    business_name: 'Riverside Heating & Cooling',
    website_url: 'https://riverside-hvac.example',
    vertical_label: 'HVAC / home services',
    category_hint: 'hvac',
    service_area: 'Sacramento metro and surrounding El Dorado County',
    business_hours: 'Mon-Fri 7am-7pm, Sat 8am-2pm; emergency line 24/7 for safety issues',
    services_summary: 'Residential furnace + AC repair, ductless mini-split install, water heater replacement, indoor air quality consultations, seasonal maintenance plans',
    phone: '+1-916-555-0182',
    locations: ['Sacramento, CA', 'Folsom, CA', 'Placerville, CA'],
    sources: ['mock'],
    confidence: 0.92,
  },
  brightwater: {
    business_name: 'Brightwater Family Dentistry',
    website_url: 'https://brightwater-dental.example',
    vertical_label: 'dental practice',
    category_hint: 'dental',
    service_area: 'Cambridge, MA and inner-Boston neighborhoods',
    business_hours: 'Mon-Thu 8am-6pm, Fri 8am-1pm, closed weekends',
    services_summary: 'General dentistry, cleanings, pediatric, cosmetic (veneers + whitening), Invisalign, same-day emergency slots reserved daily 11am and 3pm',
    phone: '+1-617-555-0118',
    locations: ['Cambridge, MA'],
    sources: ['mock'],
    confidence: 0.94,
  },
  marisol: {
    business_name: 'Marisol\'s Coastal Kitchen',
    website_url: 'https://marisols-kitchen.example',
    vertical_label: 'restaurant',
    category_hint: 'restaurant',
    service_area: '1421 Ocean Ave, Santa Monica CA 90405',
    business_hours: 'Tue-Sun 5pm-10pm, brunch Sat-Sun 10am-2pm, closed Mondays',
    services_summary: 'Coastal Spanish small plates, paella for two on weekends, full bar, private events room (max 24), Resy for reservations, DoorDash for takeout',
    phone: '+1-310-555-0177',
    locations: ['Santa Monica, CA'],
    sources: ['mock'],
    confidence: 0.91,
  },
  prairie: {
    business_name: 'Prairie & Hayes LLP',
    website_url: 'https://prairie-hayes.example',
    vertical_label: 'law firm',
    category_hint: 'legal',
    service_area: 'Cook County and northern Illinois',
    business_hours: 'Mon-Fri 9am-5:30pm CT, after-hours intake line for accidents only',
    services_summary: 'Personal injury (auto, premises, products liability), workers compensation, wrongful termination intake, free initial consultation',
    response_window: '24 business hours',
    phone: '+1-312-555-0144',
    locations: ['Chicago, IL'],
    sources: ['mock'],
    confidence: 0.93,
  },
};

function classifyVertical(text: string): {category: string; vertical_label: string} {
  for (const heuristic of VERTICAL_HEURISTICS) {
    if (heuristic.pattern.test(text)) {
      return {category: heuristic.category, vertical_label: heuristic.vertical_label};
    }
  }

  return {category: 'hvac', vertical_label: 'small business'};
}

async function fetchWebsiteText(url: string, timeoutMs = 5000): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const response = await fetch(url, {signal: controller.signal});
    clearTimeout(timer);
    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    return html
      .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
      .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .slice(0, 8000);
  } catch {
    return undefined;
  }
}

function mockKeyFor(name: string): keyof typeof MOCK_FIXTURES | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('riverside')) {
    return 'riverside';
  }

  if (lower.includes('brightwater') || lower.includes('dental')) {
    return 'brightwater';
  }

  if (lower.includes('marisol') || lower.includes('kitchen')) {
    return 'marisol';
  }

  if (lower.includes('prairie') || lower.includes('hayes') || lower.includes('law') || lower.includes('llp')) {
    return 'prairie';
  }

  return undefined;
}

/**
 * Clamp scraped/inferred text at a sentence boundary instead of mid-word.
 * "Quantified, paste-re" in a legal-facing artifact is worse than a shorter
 * but complete sentence.
 */
function sentenceClamp(text: string, maxLength = 240): string {
  const clean = text.replaceAll(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  const cut = clean.slice(0, maxLength);
  const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return boundary > 60 ? cut.slice(0, boundary + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

export async function enrichFromAgentPrompt(input: {
  agentName: string;
  systemPrompt: string;
}): Promise<EnrichmentResult> {
  const blob = `${input.agentName} ${input.systemPrompt}`.slice(0, 8000);
  const classification = classifyVertical(blob);
  const hoursMatch = (/(?:hours?|open):\s*([^.\n]{8,100})/i.exec(blob))
    ?? (/(?:mon|tue|wed)[^.\n]{8,80}/i.exec(blob));
  // Only phrases that explicitly announce a location — a bare "in" matches
  // arbitrary prose and captures prompt debris as a "service area".
  const areaMatch = /(?:service area|serving|located in|based in)\s*:?\s+([a-z][^.\n]{4,80})/i.exec(blob);
  return {
    business_name: input.agentName,
    vertical_label: classification.vertical_label,
    category_hint: classification.category,
    service_area: areaMatch?.[1]?.trim() ?? 'local area',
    business_hours: hoursMatch?.[0]?.trim() ?? 'unspecified',
    services_summary: sentenceClamp(input.systemPrompt, 400),
    sources: ['firmographic'],
    confidence: 0.65,
  };
}

export async function enrich(input: {
  businessName?: string;
  websiteUrl?: string;
  mock?: boolean;
}): Promise<EnrichmentResult> {
  const name = input.businessName?.trim() ?? '';
  const mockKey = mockKeyFor(name);
  if (input.mock && mockKey) {
    return MOCK_FIXTURES[mockKey];
  }

  if (input.mock) {
    return {
      business_name: name || 'Acme Small Business',
      website_url: input.websiteUrl,
      vertical_label: 'small business',
      category_hint: 'hvac',
      service_area: 'local metro area',
      business_hours: 'Mon-Fri 9am-5pm',
      services_summary: 'general services',
      sources: ['mock'],
      confidence: 0.5,
    };
  }

  const sources: EnrichmentSource[] = [];
  let category = 'hvac';
  let vertical_label = 'small business';
  let services_summary = '';
  if (input.websiteUrl) {
    const text = await fetchWebsiteText(input.websiteUrl);
    if (text) {
      sources.push('website');
      const classification = classifyVertical(`${name} ${text}`);
      category = classification.category;
      vertical_label = classification.vertical_label;
      services_summary = sentenceClamp(text, 400);
    }
  }

  if (sources.length === 0 && name) {
    const classification = classifyVertical(name);
    category = classification.category;
    vertical_label = classification.vertical_label;
    sources.push('manual');
  }

  return {
    business_name: name || 'Acme Small Business',
    website_url: input.websiteUrl,
    vertical_label,
    category_hint: category,
    service_area: 'local metro area',
    business_hours: 'Mon-Fri 9am-5pm',
    services_summary: services_summary || 'general services',
    sources: sources.length === 0 ? ['manual'] : sources,
    confidence: sources.includes('website') ? 0.72 : 0.45,
  };
}
