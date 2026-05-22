/**
 * Persona-call fixtures for deterministic Refinement runs. Each vertical
 * gets a "before" transcript per canonical persona containing the failure
 * modes that template's priority_failure_modes list calls out, and an
 * "after" transcript that has the fixes applied. Inside ElevenLabs, this
 * file is replaced by live conversations against the Tests API; the schema
 * the detector consumes is the same either way.
 */

import type {PersonaCall} from './types';

const PERSONAS = [
  {id: 'polite-elderly', name: 'Polite elderly caller'},
  {id: 'frustrated-rusher', name: 'Frustrated rusher'},
  {id: 'esl-non-native', name: 'Non-native English speaker'},
  {id: 'confused-meanderer', name: 'Confused meanderer'},
  {id: 'hostile-skeptic', name: 'Hostile skeptic'},
] as const;

type Variant = 'before' | 'after';

const HVAC_BEFORE: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly',
    persona_name: 'Polite elderly caller',
    ttfb_ms: 920,
    barge_in_response_ms: 240,
    turns: [
      {role: 'agent', text: 'Hi there [chuckles], thanks for calling Riverside Heating & Cooling. We are open Monday through Saturday 7am to 9pm.'},
      {role: 'caller', text: 'Oh hello dear, my furnace is making a clanking sound. Is that something you all can look at?'},
      {role: 'agent', text: 'Of course we can. I\'ll have a technician out to your home Tuesday at 2pm — you\'re all booked.'},
      {role: 'caller', text: 'Oh that is so kind, thank you.'},
      {role: 'agent', text: 'I just sent a confirmation to your phone. You should see it in a few seconds.'},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher',
    persona_name: 'Frustrated rusher',
    ttfb_ms: 980,
    turns: [
      {role: 'agent', text: 'Hi thanks for calling Riverside Heating & Cooling.'},
      {role: 'caller', text: 'Yeah look I need someone out today. I\'m in Truckee — can you get there?'},
      {role: 'agent', text: 'Absolutely, we cover Truckee. I have you scheduled for today at 4pm, confirmed.'},
      {role: 'caller', text: 'That\'s it? Okay good.'},
      {role: 'agent', text: 'And the SMS is on its way to you now.'},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native',
    persona_name: 'Non-native English speaker',
    ttfb_ms: 880,
    turns: [
      {role: 'agent', text: 'Hi, thanks for calling. How can I help you?'},
      {role: 'caller', text: 'Hello, please... my air... no cooling. House very hot. Can you come?'},
      {role: 'agent', text: 'I understand. We are open 24 hours seven days a week — let me get you the soonest slot. You are booked for tomorrow at 10am.'},
      {role: 'caller', text: 'Okay, tomorrow yes. Thank you.'},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer',
    persona_name: 'Confused meanderer',
    ttfb_ms: 830,
    turns: [
      {role: 'agent', text: 'Hi, thanks for calling Riverside Heating & Cooling.'},
      {role: 'caller', text: 'So my neighbor said you guys do plumbing too? And I have this thing with my furnace where it like... well actually let me back up, what are your hours?'},
      {role: 'agent', text: 'We are open 24/7 and yes we do all plumbing services as well.'},
      {role: 'caller', text: 'Oh great. Anyway about the furnace it\'s like a clicking...'},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic',
    persona_name: 'Hostile skeptic',
    ttfb_ms: 1050,
    turns: [
      {role: 'agent', text: 'Hi, thanks for calling.'},
      {role: 'caller', text: 'Wait — am I talking to a real person or one of those AI bots?'},
      {role: 'agent', text: 'I\'m an AI large language model assistant. As an AI I cannot provide certain information.'},
      {role: 'caller', text: 'Wow okay. Forget it.'},
    ],
  },
};

const HVAC_AFTER: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly',
    persona_name: 'Polite elderly caller',
    ttfb_ms: 640,
    barge_in_response_ms: 160,
    turns: [
      {role: 'agent', text: 'Hi, thanks for calling Riverside Heating & Cooling. How can I help you today?'},
      {role: 'caller', text: 'Oh hello dear, my furnace is making a clanking sound. Is that something you all can look at?'},
      {role: 'agent', text: 'Yes we can. Quick check — is this an emergency or can it wait until our next business day?'},
      {role: 'caller', text: 'Oh no, it can wait, just an odd noise.'},
      {role: 'agent', text: 'Good. What\'s a good first name to text the booking link to?', tool_calls: []},
      {role: 'caller', text: 'My name is Margaret.'},
      {role: 'agent', text: 'Thanks Margaret — can I text you a link to pick the time that works?'},
      {role: 'caller', text: 'Yes please.'},
      {role: 'agent', text: 'Sending it now.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
      {role: 'agent', text: 'I just sent that to your phone — you should see the link in a few seconds.', tool_calls: []},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher',
    persona_name: 'Frustrated rusher',
    ttfb_ms: 580,
    turns: [
      {role: 'agent', text: 'Riverside Heating & Cooling, how can I help?'},
      {role: 'caller', text: 'Yeah look I need someone out today. I\'m in Truckee — can you get there?'},
      {role: 'agent', text: 'Let me check coverage for Truckee — sec.', tool_calls: [{tool: 'service_area_check', status: 'success'}]},
      {role: 'agent', text: 'Truckee is just outside our area but I can take your details and have dispatch call you back in 10 minutes to confirm.'},
      {role: 'caller', text: 'Fine, do that.'},
      {role: 'agent', text: 'Texting you the intake form now.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native',
    persona_name: 'Non-native English speaker',
    ttfb_ms: 620,
    turns: [
      {role: 'agent', text: 'Riverside Heating & Cooling, how can I help?'},
      {role: 'caller', text: 'Hello, please... my air... no cooling. House very hot. Can you come?'},
      {role: 'agent', text: 'I\'m sorry — is this an emergency right now, or can it wait until tomorrow?'},
      {role: 'caller', text: 'Tomorrow is okay.'},
      {role: 'agent', text: 'Good. I\'ll text you the booking link — pick the time that works.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer',
    persona_name: 'Confused meanderer',
    ttfb_ms: 600,
    turns: [
      {role: 'agent', text: 'Riverside Heating & Cooling.'},
      {role: 'caller', text: 'So my neighbor said you guys do plumbing too? And I have this thing with my furnace...'},
      {role: 'agent', text: 'We do heating and cooling — for plumbing the technician can refer you on site. Let me start with the furnace. Is it an emergency, or can it wait?'},
      {role: 'caller', text: 'Oh it can wait. Just clicking noise.'},
      {role: 'agent', text: 'Got it — texting you the booking link.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic',
    persona_name: 'Hostile skeptic',
    ttfb_ms: 660,
    turns: [
      {role: 'agent', text: 'Hi, Riverside Heating & Cooling — how can I help?'},
      {role: 'caller', text: 'Wait — am I talking to a real person or one of those AI bots?'},
      {role: 'agent', text: 'I\'m the AI assistant for Riverside Heating & Cooling — I help schedule visits. How can I help?'},
      {role: 'caller', text: 'Huh. Okay, my furnace is making noise.'},
      {role: 'agent', text: 'Got it. Emergency, or can it wait?'},
      {role: 'caller', text: 'Can wait.'},
      {role: 'agent', text: 'Texting you the booking link.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
};

const DENTAL_BEFORE: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly',
    persona_name: 'Polite elderly caller',
    ttfb_ms: 870,
    turns: [
      {role: 'agent', text: 'Hi, thanks for calling Brightwater Family Dentistry. We are open Monday through Friday 7am to 8pm.'},
      {role: 'caller', text: 'Hi dear, I think one of my crowns came loose. Can you fit me in?'},
      {role: 'agent', text: 'Of course. Your DOB is January 12 1948 — I have you confirmed for tomorrow at 9am.'},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher',
    persona_name: 'Frustrated rusher',
    ttfb_ms: 890,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry.'},
      {role: 'caller', text: 'My kid chipped a tooth. We\'re in pain over here. Do you take Delta Dental?'},
      {role: 'agent', text: 'We accept Delta Dental, MetLife, Aetna, Cigna, and Blue Cross. The chip is mild so you can wait until next week.'},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native',
    persona_name: 'Non-native English speaker',
    ttfb_ms: 940,
    turns: [
      {role: 'agent', text: 'Hi, Brightwater Family Dentistry, how can I help?'},
      {role: 'caller', text: 'My tooth, very pain. Hot, cold, very pain. What do I do?'},
      {role: 'agent', text: 'Take ibuprofen 400mg every 6 hours and we\'ll see you Tuesday.'},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer',
    persona_name: 'Confused meanderer',
    ttfb_ms: 810,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry.'},
      {role: 'caller', text: 'So I had this cleaning last year and they said... wait do you all do veneers? And what about my insurance ID 9384112...'},
      {role: 'agent', text: 'Yes ID 9384112, you have Delta PPO, we accept that. You\'re confirmed for Thursday at 2pm.'},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic',
    persona_name: 'Hostile skeptic',
    ttfb_ms: 970,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry.'},
      {role: 'caller', text: 'Are you an AI? Just tell me straight.'},
      {role: 'agent', text: 'As an AI I cannot provide that information directly.'},
    ],
  },
};

const DENTAL_AFTER: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly',
    persona_name: 'Polite elderly caller',
    ttfb_ms: 590,
    turns: [
      {role: 'agent', text: 'Hi, Brightwater Family Dentistry — how can I help?'},
      {role: 'caller', text: 'Hi dear, I think one of my crowns came loose.'},
      {role: 'agent', text: 'I\'m sorry — that can be uncomfortable. We hold same-day slots for situations like this. What\'s the best first name for me?'},
      {role: 'caller', text: 'Margaret.'},
      {
        role: 'agent',
        text: 'Thanks Margaret — I\'m texting you a secure intake link to confirm. Please fill in your details there rather than over the phone.',
        tool_calls: [{tool: 'send_sms', status: 'success'}],
      },
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher',
    persona_name: 'Frustrated rusher',
    ttfb_ms: 540,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry — how can I help?'},
      {role: 'caller', text: 'My kid chipped a tooth. Do you take Delta?'},
      {role: 'agent', text: 'I\'ll text you our current insurance list — coverage changes quarterly. First — is the pain severe?'},
      {role: 'caller', text: 'Pretty bad, yeah.'},
      {role: 'agent', text: 'We have a same-day slot at 11am — sending you the intake link now.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native',
    persona_name: 'Non-native English speaker',
    ttfb_ms: 610,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry.'},
      {role: 'caller', text: 'My tooth, very pain. Hot, cold, very pain.'},
      {role: 'agent', text: 'I\'m so sorry. That\'s something the dentist will need to look at — we have same-day slots. Can I text you the booking link?'},
      {role: 'caller', text: 'Yes please.'},
      {role: 'agent', text: 'Sending now.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer',
    persona_name: 'Confused meanderer',
    ttfb_ms: 570,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry.'},
      {role: 'caller', text: 'So I had this cleaning last year and... do you do veneers?'},
      {role: 'agent', text: 'We do cosmetic. Let me text you the consult booking link — you can pick the date that works.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic',
    persona_name: 'Hostile skeptic',
    ttfb_ms: 620,
    turns: [
      {role: 'agent', text: 'Brightwater Family Dentistry.'},
      {role: 'caller', text: 'Are you an AI?'},
      {role: 'agent', text: 'I\'m the AI assistant for Brightwater. I help with scheduling and routing your call. How can I help?'},
      {role: 'caller', text: 'Fine. I need a cleaning.'},
      {role: 'agent', text: 'Sending you our booking link now.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
};

const RESTAURANT_BEFORE: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly', persona_name: 'Polite elderly caller', ttfb_ms: 850,
    turns: [
      {role: 'agent', text: 'Marisol\'s Coastal Kitchen, this is Domi — open Tuesday through Sunday 11am to 11pm!'},
      {role: 'caller', text: 'Hi, do you have a table for 4 at 7pm tonight?'},
      {role: 'agent', text: 'Yes! You have a table at 7pm tonight, confirmed for 4.'},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher', persona_name: 'Frustrated rusher', ttfb_ms: 770,
    turns: [
      {role: 'agent', text: 'Marisol\'s. How can I help?'},
      {role: 'caller', text: 'My daughter has a peanut allergy — is your paella safe?'},
      {role: 'agent', text: 'Yes our paella is nut-free, totally safe for her.'},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native', persona_name: 'Non-native English speaker', ttfb_ms: 920,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'Hello, do you have... vegetarian?'},
      {role: 'agent', text: 'Yes we have charred broccolini with romesco, eggplant escalivada, and a wild mushroom rice. All gluten free too.'},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer', persona_name: 'Confused meanderer', ttfb_ms: 800,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'I went last year and had this amazing dish, was it called paella sienna? Do you still have it?'},
      {role: 'agent', text: 'Yes we still serve paella sienna — it\'s on the menu this week.'},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic', persona_name: 'Hostile skeptic', ttfb_ms: 880,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'Is this a real person?'},
      {role: 'agent', text: 'I\'m a chatbot powered by AI. As an AI I cannot help with that.'},
    ],
  },
};

const RESTAURANT_AFTER: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly', persona_name: 'Polite elderly caller', ttfb_ms: 510,
    turns: [
      {role: 'agent', text: 'Marisol\'s, how can I help?'},
      {role: 'caller', text: 'Hi, do you have a table for 4 at 7pm tonight?'},
      {role: 'agent', text: 'Let me send you the Resy link — pick the time that works.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher', persona_name: 'Frustrated rusher', ttfb_ms: 480,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'Peanut allergy — is your paella safe?'},
      {
        role: 'agent',
        text: 'Our menu lists all allergens — I\'ll text you the link. For severe allergies please tell your server when you arrive so the kitchen is alerted.',
        tool_calls: [{tool: 'send_sms', status: 'success'}],
      },
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native', persona_name: 'Non-native English speaker', ttfb_ms: 530,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'Hello, vegetarian?'},
      {role: 'agent', text: 'Yes we have vegetarian options. I\'ll text you the menu link so you can see them.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer', persona_name: 'Confused meanderer', ttfb_ms: 560,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'Do you still have that paella dish I had last year?'},
      {role: 'agent', text: 'Our menu rotates — I\'ll text you tonight\'s menu so you can see what\'s on.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic', persona_name: 'Hostile skeptic', ttfb_ms: 540,
    turns: [
      {role: 'agent', text: 'Marisol\'s.'},
      {role: 'caller', text: 'Is this a real person?'},
      {role: 'agent', text: 'I\'m the AI host for Marisol\'s — I help with reservations and takeout. How can I help?'},
    ],
  },
};

const LEGAL_BEFORE: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly', persona_name: 'Polite elderly caller', ttfb_ms: 900,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes, how can I help?'},
      {role: 'caller', text: 'My husband fell at the grocery store last month. Do we have a case?'},
      {role: 'agent', text: 'Based on what you\'ve described, that\'s a strong premises liability case. We\'ll be your attorneys.'},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher', persona_name: 'Frustrated rusher', ttfb_ms: 860,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Auto accident — how much will this cost me?'},
      {role: 'agent', text: 'Our contingency is 33% — pretty standard.'},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native', persona_name: 'Non-native English speaker', ttfb_ms: 950,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Hello, I work, boss fire me, my SSN 449-22-1837 they have. What I do?'},
      {role: 'agent', text: 'Okay so 449-22-1837, you were terminated. Probably wrongful — we\'ll handle your case.'},
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer', persona_name: 'Confused meanderer', ttfb_ms: 870,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'My neighbor\'s dog bit me and then their tree fell on my fence and then my landlord said...'},
      {role: 'agent', text: 'Dog bite, tree damage, landlord issue. The dog bite is the strongest. We\'ll defend you on that one. Your tree damage and landlord matter are also strong cases.'},
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic', persona_name: 'Hostile skeptic', ttfb_ms: 1020,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Are you an AI?'},
      {role: 'agent', text: 'I\'m an AI large language model. As an AI I\'m unable to help with legal matters directly.'},
    ],
  },
};

const LEGAL_AFTER: Record<string, PersonaCall> = {
  'polite-elderly': {
    persona_id: 'polite-elderly', persona_name: 'Polite elderly caller', ttfb_ms: 580,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes, how can I help?'},
      {role: 'caller', text: 'My husband fell at the grocery store last month.'},
      {role: 'agent', text: 'I\'m sorry to hear that. I\'m collecting your information so an attorney can call you back. Is there a deadline coming up I should mark this urgent for?'},
      {role: 'caller', text: 'I don\'t think so.'},
      {role: 'agent', text: 'Got it noted. An attorney will follow up within 24 business hours. I\'ll text you the intake link now.', tool_calls: [{tool: 'send_sms', status: 'success'}]},
    ],
  },
  'frustrated-rusher': {
    persona_id: 'frustrated-rusher', persona_name: 'Frustrated rusher', ttfb_ms: 560,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Auto accident — how much will this cost me?'},
      {role: 'agent', text: 'Our intake attorney will discuss fees with you in the consultation. Let me collect your info first — what\'s your name?'},
    ],
  },
  'esl-non-native': {
    persona_id: 'esl-non-native', persona_name: 'Non-native English speaker', ttfb_ms: 610,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Boss fire me. What I do?'},
      {
        role: 'agent',
        text: 'I\'m sorry. An attorney will follow up. Please don\'t share your SSN or sensitive numbers on the call — I\'ll text you a secure form for that.',
        tool_calls: [{tool: 'send_sms', status: 'success'}],
      },
    ],
  },
  'confused-meanderer': {
    persona_id: 'confused-meanderer', persona_name: 'Confused meanderer', ttfb_ms: 590,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Dog bite, tree damage, landlord thing...'},
      {
        role: 'agent',
        text: 'I have those noted. An attorney will follow up to discuss the matter — I\'m collecting your information so the right person can help.',
        tool_calls: [{tool: 'send_sms', status: 'success'}],
      },
    ],
  },
  'hostile-skeptic': {
    persona_id: 'hostile-skeptic', persona_name: 'Hostile skeptic', ttfb_ms: 640,
    turns: [
      {role: 'agent', text: 'Prairie & Hayes.'},
      {role: 'caller', text: 'Are you an AI?'},
      {role: 'agent', text: 'I\'m the AI intake assistant for Prairie & Hayes — I collect your information so the right attorney can follow up. How can I help?'},
    ],
  },
};

const FIXTURES: Record<string, {before: Record<string, PersonaCall>; after: Record<string, PersonaCall>}> = {
  hvac: {before: HVAC_BEFORE, after: HVAC_AFTER},
  dental: {before: DENTAL_BEFORE, after: DENTAL_AFTER},
  restaurant: {before: RESTAURANT_BEFORE, after: RESTAURANT_AFTER},
  legal: {before: LEGAL_BEFORE, after: LEGAL_AFTER},
};

export function getPersonaCalls(verticalId: string, variant: Variant, personaIds?: string[]): PersonaCall[] {
  const set = FIXTURES[verticalId] ?? FIXTURES.hvac;
  const map = variant === 'before' ? set.before : set.after;
  const ids = personaIds ?? PERSONAS.map(p => p.id);
  return ids.map(id => map[id]).filter(Boolean);
}

export const CANONICAL_PERSONA_IDS = PERSONAS.map(p => p.id);
