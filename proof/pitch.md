# Refinement — pitch script

Audience: ElevenLabs product team + CEO deciding what goes on the platform roadmap.
Positioning: a feature ElevenLabs ships inside the agent builder, not a third-party SDK.
The story is about every ElevenLabs customer, not about us.

Runtime: ~4:30 if you do not rush the demo.

---

## Five second open

Show the current ElevenLabs agent creation flow. Empty agent. Blank system prompt. A new customer has to know what they are doing or the agent is bad. Then cut to the same screen with one button. Refine this agent. Click it. Thirty seconds later the agent has a tested system prompt, twelve voice integrations wired, a regression suite, a compliance artifact, and a live demo call that works. One sentence over the top:

> Every agent created on ElevenLabs should ship at this quality from minute one, not month three.

## Beat 1 — The gap every customer hits (~60s)

Right now ElevenLabs gives every new customer the same starting point. Blank agent. Blank prompt. Pick a voice. Good luck. The customers who succeed are the ones with a prompt engineer on staff. The customers who churn are the small and mid market accounts who built an agent, placed three test calls, heard it fail in a way they did not understand, and quietly walked away.

The platform is bottlenecked on the skill of the customer, not the capability of the product. Every new agent that gets created is a coin flip on whether the customer can self serve their way to something they would actually deploy. The agents that get deployed badly become the bad demo videos on Twitter. The platform takes the reputation hit for a customer skill gap.

## Beat 2 — What the feature actually does (~90s)

A refinement layer that runs inside the agent builder.

**Enrichment.** The moment a customer types a business name or pastes a website URL, the system enriches automatically. Public Clay style firmographic data. Website scrape for tone, services, hours, locations. Google Maps for service area. Business category drives the template selection. Trades contractor gets the trades template. Dentist gets the dentist template. Restaurant gets the restaurant template. Each template comes pre wired with the common ElevenLabs integrations for that vertical. Twilio inbound. Calendar booking. CRM webhook. SMS confirmation. Recap email. The customer did not have to know any of this existed. It is just there.

**Ingestion.** The customer drops in their data. Any data. Call logs from their old system. A CSV of FAQs. A PDF of their service menu. A transcript of one bad call they had last week. The system ingests it and turns it into a test suite. Real customer language becomes the regression battery. The bad call becomes the first test that the agent has to pass.

**Refinement.** The agent gets exercised against five canonical personas. Polite elderly caller. Frustrated rusher. Non native English. Confused meanderer. Hostile skeptic. The system watches every failure mode the platform has ever seen across the entire ElevenLabs agent configuration surface. Voice marker leakage. TTS directive emission. Hallucinated business hours. Wrong service area. Booking confirmation that promises something the calendar integration cannot deliver. Every failure becomes a fix proposal. Every fix becomes a regression test. The customer watches it happen.

## Beat 3 — The surfaced experience (~90s)

This is the part that matters most and the part that is easiest to get wrong. The refinement cannot be a black box that runs for two minutes and returns a green checkmark. The customer has to feel the quality being built.

So every step renders. The website scrape shows what was learned. The persona calls play as audio. The defects highlight inline in the transcript with the exact phrase that failed. The fix proposal shows the prompt diff in plain language, not engineer language. The compliance artifact generates as a one page PDF the customer can hand to their lawyer. The regression suite shows up as a dashboard the customer can run again next month.

The emotional proof is that the customer watched their agent get better in front of their eyes. They saw the bad call get caught. They saw the fix get proposed. They saw the test get added. They heard the new version handle the same call cleanly. They did not need to know what a system prompt is. They did not need to write a single rubric. They did not need to be a prompt engineer. They just needed to want a working voice agent for their business and the platform gave them one.

This is what beats the procurement question by erasing it. The compliance team does not have to ask how do you verify agent behavior because the artifact is sitting in the dashboard from the moment the agent was created.

## Beat 4 — What this does to the business (~60s)

Three things change for ElevenLabs the moment this ships inside the builder.

**Activation rate on new agent creation goes up.** Today a meaningful fraction of created agents never get a second call placed against them. The customer tried it, it was bad, they bounced. With refinement, the first call the customer places is the polished call. The activation curve moves and the cohort retention follows it.

**Self serve revenue expands into segments that cannot currently self serve.** Every small business owner who would buy a voice agent if it just worked is currently locked out because they do not know how to make one work. Refinement collapses the skill floor. The total addressable market on the self serve tier widens by an order of magnitude because the customer no longer needs a prompt engineer to get to a deployable agent.

**Enterprise sales cycle compresses.** The sales engineer who used to spend three weeks crafting a custom demo for each prospect now generates the demo in an afternoon, against the prospect's actual business data, with the regression artifact attached. The proof of concept phase shortens. The procurement gauntlet has its answers pre filled.

## Overpromise line

Refinement turns the agent builder from a workbench for prompt engineers into a finished product for every business on earth. The platform stops selling capability and starts selling outcomes. The acquisition story stops being come build a voice agent and starts being come receive a voice agent built for your business in thirty seconds. That is a different company at a different valuation.

## Close

Right now ElevenLabs ships the engine. The customer is expected to build the car. Refinement ships the car. Every agent created on the platform from the day this lands is a deployable production grade voice agent enriched with the business's own data, tested against its own customers, wrapped in its own compliance artifact, and surfaced in a way that the business owner watched happen and trusts.

## Two honest flags if anyone asks

**Legal surface on enrichment sources.** Clay style firmographic data, Google Maps, and website scraping all have terms of service that have to be cleared before this ships inside the product. That is a real conversation and not a technical conversation.

**The failure mode catalog is a network effect, and the network effect belongs inside ElevenLabs.** The refinement loop is only as good as the failure mode catalog it draws from. The system needs to learn from every agent across the platform to keep getting better. That means the feature actually wants to be inside ElevenLabs, not outside it. Outside it sees only the agents the SDK user runs. Inside it sees every agent created and every call placed and every defect that ever shipped. The feature becomes more valuable the more it is embedded. That is the strategic reason this belongs in the product and not in a third party SDK competing with the product.
