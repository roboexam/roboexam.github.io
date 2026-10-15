export type MetricNarrative = {
  sourceMode: string;
  sourceNote: string;
  need: string;
  question: string;
  answerExample: string;
  plainScoring: string[];
  explains: string;
};

type MetricContract = {
  origin: string;
  source_note: string;
  need: string;
  question: string;
  answer_example: string;
  plain_scoring: string[];
  explains: string;
};

export function metricNarrative(metric: MetricContract): MetricNarrative {
  return {
    sourceMode: metric.origin,
    sourceNote: metric.source_note,
    need: metric.need,
    question: metric.question,
    answerExample: metric.answer_example,
    plainScoring: metric.plain_scoring,
    explains: metric.explains,
  };
}
