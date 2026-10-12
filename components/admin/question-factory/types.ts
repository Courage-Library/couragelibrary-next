export interface FactoryTaxonomy {
  subjects: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; subjectId: string }>;
  subtopics: Array<{ id: string; name: string; topicId: string }>;
  exams: Array<{ id: string; title: string; slug: string }>;
}

export const SELECT_CLASS =
  "w-full p-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 outline-none focus:border-blue-500";
