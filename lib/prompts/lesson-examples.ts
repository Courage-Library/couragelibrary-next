/**
 * LESSON-PROMPT-2: one short example lesson per subject type ({{EXAMPLE_FOR_SUBJECT_TYPE}} in LESSON template v2). Each
 * is valid LESSON_BLOCKS v2 JSON (scripts/test_ca4_lessons.cjs proves it through parseLessonPaste) and models the v2 rules:
 * quick checks with EXACTLY 4 options and feedback on every option, an exam-strategy list, a WARNING for exceptions.
 * APTITUDE uses a formula block; LANGUAGE never does; GK_GA shows a fact table + a MEMORY_HOOK callout; REASONING a
 * worked layout as a table. Original content. STATE_SPECIFIC subjects use the GK_GA example.
 */
import { LESSON_PASTE_CONTRACT } from "@/lib/prompts/lesson-contract";

export const EXAMPLE_SUBJECT_TYPES = ["APTITUDE", "REASONING", "LANGUAGE", "GK_GA", "TECHNICAL", "PEDAGOGY"] as const;
export type ExampleSubjectType = (typeof EXAMPLE_SUBJECT_TYPES)[number];

/** The template section / example for a stored subject type (STATE_SPECIFIC → GK_GA). */
export const sectionForSubjectType = (t: string | null): ExampleSubjectType | null =>
  t === "STATE_SPECIFIC" ? "GK_GA" : (EXAMPLE_SUBJECT_TYPES as readonly string[]).includes(t || "") ? (t as ExampleSubjectType) : null;

type Opt = [string, boolean, string];
const qc = (id: string, prompt: string, opts: Opt[]) => ({ id, type: "quick_check", prompt, options: opts.map(([text, correct, feedback], i) => ({ id: `o${i + 1}`, text, correct, feedback })) });
const strategy = (items: string[]) => [
  { id: "strategy-h", type: "heading", level: 2, text: "Exam strategy" },
  { id: "strategy", type: "list", ordered: false, items },
];
const tail = (nodeId: string, bullets: string[], points: string[], formulas?: string[]) => [
  { id: "practice", type: "practice_link", node_id: nodeId, mode: "PRACTICE", label: "Practice this topic" },
  { id: "summary", type: "revision_summary", bullets, ...(formulas ? { formulas } : {}), speed_rules: ["Read the last line of the question first."] },
  { id: "memory", type: "memory_lock_points", points },
];

export function lessonExampleFor(type: ExampleSubjectType, nodeId: string): Record<string, unknown> {
  const env = (title: string, summary: string, blocks: unknown[]) => ({ contract: LESSON_PASTE_CONTRACT, meta: { title, summary, estimated_minutes: 30 }, blocks, uncertain_facts: [] as string[] });
  switch (type) {
    case "APTITUDE":
      return env("Successive Percentage Change", "How two or more percentage changes combine.", [
        { id: "intro-h", type: "heading", level: 2, text: "What it means" },
        { id: "intro", type: "paragraph", text: "When a value changes by **a%** and then by **b%**, the second change acts on the new value." },
        { id: "f-net", type: "formula", name: "Net change", latex: "a + b + \\frac{ab}{100}", reading: "a plus b plus a times b over 100" },
        { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "A price rises by 10% and then by 20%. Find the net change.", steps: [{ text: "Use the net change formula.", math: "10 + 20 + \\frac{10 \\times 20}{100}" }, { text: "Add: 30 + 2 = 32." }], answer: "32% increase", shortcut: "a + b + ab/100.", mistake: "Adding 10 and 20 to get 30%." },
        { id: "warn-1", type: "callout", variant: "WARNING", title: "Decrease", text: "A decrease is a negative value: use -10 for a 10% fall." },
        { id: "trap-1", type: "trap", kind: "FORMULA_CONFUSION", text: "Adding the two percentages.", why: "The second change acts on the new value, not the original." },
        qc("qc-1", "A value falls by 10% and then rises by 10%. The net change is…", [["0%", false, "The two changes act on different bases."], ["1% decrease", true, "-10 + 10 - 1 = -1."], ["1% increase", false, "The product term is negative here."], ["2% decrease", false, "Only one product term: -1."]]),
        ...strategy(["Attempt these early: they take under a minute.", "Use the formula, never two separate steps."]),
        ...tail(nodeId, ["Net change = a + b + ab/100."], ["a + b + ab/100", "A decrease is negative", "The order of the changes does not matter", "Three changes: apply the formula twice", "Price × consumption = expenditure"], ["a + b + \\frac{ab}{100}"]),
      ]);
    case "REASONING":
      return env("Coding-Decoding: Letter Shifting", "How a word is coded by moving each letter a fixed number of places.", [
        { id: "intro-h", type: "heading", level: 2, text: "The pattern" },
        { id: "intro", type: "paragraph", text: "In letter shifting, each letter moves forward or backward by the same number of places in the alphabet." },
        { id: "layout", type: "table", caption: "CAT coded as ECV (+2)", headers: ["Letter", "Position", "+2", "Code"], rows: [["C", "3", "5", "E"], ["A", "1", "3", "C"], ["T", "20", "22", "V"]] },
        { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "If DOG is coded as FQI, how is CAT coded?", steps: [{ text: "D → F, O → Q, G → I: each letter moves +2." }, { text: "C → E, A → C, T → V." }], answer: "ECV", shortcut: "Find the shift from the first letter only, then confirm with one more.", mistake: "Shifting by the position number instead of a fixed step." },
        { id: "warn-1", type: "callout", variant: "WARNING", title: "Wrap-around", text: "After Z the count continues from A: Y + 3 = B." },
        { id: "trap-1", type: "trap", kind: "MISREAD_KEYWORD", text: "Decoding with the coding direction.", why: "Decoding reverses the shift: use -2, not +2." },
        qc("qc-1", "If BOOK is coded as CPPL, how is LAMP coded?", [["MBNQ", true, "Each letter moves +1."], ["KZLO", false, "This shifts -1."], ["MBNO", false, "The last letter is not shifted."], ["NCOR", false, "This shifts +2."]]),
        ...strategy(["Check the first two letters to find the rule.", "Skip a mixed-rule question if it takes more than 60 seconds."]),
        ...tail(nodeId, ["Find the shift from one letter, confirm with a second."], ["Decoding reverses the shift", "After Z comes A", "Check two letters before answering", "Reverse alphabet: A ↔ Z", "Position of M is 13"]),
      ]);
    case "LANGUAGE":
      return env("Active to Passive Voice: Simple Present", "How to change a simple present sentence from active to passive voice.", [
        { id: "intro-h", type: "heading", level: 2, text: "The rule" },
        { id: "intro", type: "paragraph", text: "In the passive voice the object of the active sentence becomes the subject, and the verb becomes **am / is / are + past participle**." },
        { id: "rules", type: "list", ordered: true, items: ["Move the object to the front: *Ravi writes a letter* → *A letter …*", "Use is / am / are to agree with the new subject: *A letter is …*", "Add the past participle of the main verb: *A letter is written …*", "Add *by* + the old subject when it matters: *A letter is written by Ravi.*"] },
        { id: "structure", type: "table", caption: "Simple present: active → passive", headers: ["Active", "Passive"], rows: [["She cleans the room.", "The room is cleaned by her."], ["They play cricket.", "Cricket is played by them."], ["I write letters.", "Letters are written by me."]] },
        { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "Change into passive: The teacher checks the copies.", steps: [{ text: "Object 'the copies' becomes the subject; it is plural, so use 'are'." }, { text: "Past participle of 'check' is 'checked'." }], answer: "The copies are checked by the teacher.", mistake: "Using 'is' with the plural subject 'copies'." },
        { id: "warn-1", type: "callout", variant: "WARNING", title: "Intransitive verbs", text: "A verb without an object (She sleeps.) has no passive form." },
        { id: "trap-1", type: "trap", kind: "DISTRACTOR_TRAP", text: "Choosing 'is written' for a plural subject.", why: "The helping verb agrees with the NEW subject." },
        qc("qc-1", "Choose the passive voice of: He reads the newspaper.", [["The newspaper is read by him.", true, "Singular subject + is + past participle."], ["The newspaper was read by him.", false, "'Was' changes the tense to past."], ["The newspaper is reading by him.", false, "Passive needs the past participle, not -ing."], ["The newspaper are read by him.", false, "'Newspaper' is singular: use 'is'."]]),
        ...strategy(["Find the tense of the active verb first.", "Eliminate options with the wrong tense before checking agreement."]),
        ...tail(nodeId, ["Simple present passive = am / is / are + past participle."], ["Object becomes subject", "Helping verb agrees with the new subject", "Past participle, never -ing", "No passive for intransitive verbs", "Keep the tense unchanged"]),
      ]);
    case "GK_GA":
      return env("Indian National Movement: Key Sessions", "The landmark Indian National Congress sessions and why they matter.", [
        { id: "intro-h", type: "heading", level: 2, text: "Why these sessions matter" },
        { id: "intro", type: "paragraph", text: "Exams ask who presided over a session, where it was held and what it decided. Learn them as a table." },
        { id: "facts", type: "table", caption: "Landmark sessions", headers: ["Year", "Place", "President", "Decision"], rows: [["1885", "Bombay", "W. C. Bonnerjee", "First session"], ["1929", "Lahore", "Jawaharlal Nehru", "Purna Swaraj resolution"]] },
        { id: "hook", type: "callout", variant: "MEMORY_HOOK", title: "Remember", text: "Lahore 1929 = 'L for Liberty': the Purna Swaraj resolution." },
        { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "At which session was the Purna Swaraj resolution passed?", steps: [{ text: "Recall the table: Purna Swaraj → 1929." }, { text: "The 1929 session was held at Lahore." }], answer: "Lahore, 1929", mistake: "Confusing it with the 1930 Dandi March." },
        { id: "warn-1", type: "callout", variant: "WARNING", title: "Year vs event", text: "The resolution was passed in December 1929; Independence Day was first observed on 26 January 1930." },
        { id: "trap-1", type: "trap", kind: "DISTRACTOR_TRAP", text: "Choosing 1930 because of 26 January 1930.", why: "1930 is when it was celebrated, not passed." },
        qc("qc-1", "Who presided over the first session of the Indian National Congress?", [["W. C. Bonnerjee", true, "He presided in Bombay, 1885."], ["Dadabhai Naoroji", false, "He presided in 1886."], ["A. O. Hume", false, "He was a founder, not the president."], ["Badruddin Tyabji", false, "He presided in 1887."]]),
        ...strategy(["Learn sessions as a table: year, place, president, decision.", "Do not guess a year you cannot place in the table."]),
        ...tail(nodeId, ["1885 Bombay: first session.", "1929 Lahore: Purna Swaraj."], ["1885: Bombay, W. C. Bonnerjee", "1929: Lahore, Purna Swaraj", "26 January 1930: first Independence Day", "Founder: A. O. Hume", "1886: Dadabhai Naoroji"]),
      ]);
    case "TECHNICAL":
      return env("Ohm's Law", "The relation between voltage, current and resistance in a conductor.", [
        { id: "intro-h", type: "heading", level: 2, text: "Definition" },
        { id: "intro", type: "paragraph", text: "At a constant temperature, the current through a conductor is directly proportional to the voltage across it." },
        { id: "f-ohm", type: "formula", name: "Ohm's law", latex: "V = I \\times R", reading: "voltage equals current times resistance" },
        { id: "units", type: "table", caption: "Quantities and units", headers: ["Quantity", "Symbol", "SI unit"], rows: [["Voltage", "V", "volt (V)"], ["Current", "I", "ampere (A)"], ["Resistance", "R", "ohm (Ω)"]] },
        { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "A current of 2 A flows through a 5 Ω resistor. Find the voltage.", steps: [{ text: "Use V = I × R.", math: "V = 2 \\times 5" }, { text: "V = 10 V." }], answer: "10 V", mistake: "Dividing instead of multiplying." },
        { id: "warn-1", type: "callout", variant: "WARNING", title: "Non-ohmic devices", text: "A diode does not follow Ohm's law: its current does not rise in proportion to voltage." },
        { id: "trap-1", type: "trap", kind: "CALCULATION_SLIP", text: "Using milliamperes as amperes.", why: "Convert mA to A first: 500 mA = 0.5 A." },
        qc("qc-1", "The SI unit of resistance is…", [["ohm", true, "Resistance is measured in ohms (Ω)."], ["volt", false, "Volt is the unit of voltage."], ["ampere", false, "Ampere is the unit of current."], ["watt", false, "Watt is the unit of power."]]),
        ...strategy(["Write the formula and the units before substituting.", "Convert every value to SI units first."]),
        ...tail(nodeId, ["V = I × R at a constant temperature."], ["V = I × R", "Ohm is the unit of resistance", "Convert mA to A", "Diodes are non-ohmic", "Temperature must be constant"], ["V = I \\times R"]),
      ]);
    case "PEDAGOGY":
      return env("Piaget's Stages of Cognitive Development", "The four stages of cognitive development and what they mean for teaching.", [
        { id: "intro-h", type: "heading", level: 2, text: "The theory" },
        { id: "intro", type: "paragraph", text: "Jean Piaget held that children think differently at different ages and build knowledge actively through experience." },
        { id: "stages", type: "table", caption: "The four stages", headers: ["Stage", "Approximate age", "Key feature"], rows: [["Sensorimotor", "0-2 years", "Object permanence"], ["Preoperational", "2-7 years", "Egocentrism"], ["Concrete operational", "7-11 years", "Conservation"], ["Formal operational", "11 years and above", "Abstract thinking"]] },
        { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "A child understands that water poured into a taller glass is the same amount. Which stage?", steps: [{ text: "This is conservation." }, { text: "Conservation appears in the concrete operational stage." }], answer: "Concrete operational", mistake: "Choosing the preoperational stage." },
        { id: "warn-1", type: "callout", variant: "WARNING", title: "Ages are approximate", text: "Questions test the order and the features, not exact ages." },
        { id: "trap-1", type: "trap", kind: "DISTRACTOR_TRAP", text: "Mixing up Piaget with Vygotsky.", why: "The zone of proximal development is Vygotsky's idea." },
        qc("qc-1", "Egocentrism is a feature of which stage?", [["Preoperational", true, "Children of 2-7 years see the world only from their own view."], ["Sensorimotor", false, "Its key feature is object permanence."], ["Concrete operational", false, "Its key feature is conservation."], ["Formal operational", false, "Its key feature is abstract thinking."]]),
        ...strategy(["Match the feature to the stage, then check the age.", "Watch for options from other thinkers."]),
        ...tail(nodeId, ["Four stages in a fixed order."], ["Sensorimotor: object permanence", "Preoperational: egocentrism", "Concrete operational: conservation", "Formal operational: abstract thinking", "Children construct knowledge actively"]),
      ]);
  }
}
