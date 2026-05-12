/**
 * DAG judge — composable decision-tree verdict.
 *
 * Each internal node has an async `pick(value)` that returns the child
 * index to descend into; each leaf returns a fixed score + reasoning.
 * The traversal is short-circuit: once a leaf is reached, no further
 * nodes are evaluated.
 *
 * Reference: DeepEval's DAG metric — composable judge trees beat single
 * monolithic rubrics by letting each branch encode a clean sub-rule
 * (and by surfacing exactly which rule fired on a given output).
 *
 * Pair with a LeafNode wrapping `gEvalJudge` if you want sub-rubric
 * scoring at the leaves; use raw {score, reasoning} for deterministic
 * branches (regex matches, length checks, etc.).
 */

export type DagLeafNode = {
  type: 'leaf';
  name: string;
  score: number;
  reasoning: string;
};

export type DagDecisionNode = {
  type: 'decision';
  name: string;
  /**
   * Async picker that selects which child to descend into.
   * Return the index into `children`. Return -1 to short-circuit with
   * a "no path" result (treated as score 0).
   */
  pick: (value: string) => Promise<number>;
  children: DagNode[];
};

export type DagNode = DagLeafNode | DagDecisionNode;

export type DagResult = {
  score: number;
  /** Names of every node traversed, root-to-leaf. */
  path: string[];
  reasoning: string;
};

export async function evaluateDag(node: DagNode, value: string): Promise<DagResult> {
  if (node.type === 'leaf') {
    return {score: node.score, path: [node.name], reasoning: node.reasoning};
  }

  const childIdx = await node.pick(value);
  if (childIdx < 0 || childIdx >= node.children.length) {
    return {
      score: 0,
      path: [node.name],
      reasoning: `decision node "${node.name}" picked invalid child index ${childIdx}`,
    };
  }

  const child = node.children[childIdx];
  const sub = await evaluateDag(child, value);
  return {
    score: sub.score,
    path: [node.name, ...sub.path],
    reasoning: sub.reasoning,
  };
}

/**
 * Convenience constructor for the most common shape: a decision node
 * whose `pick` does a regex match against the value to choose between
 * two sub-branches.
 */
export function regexBranch(
  name: string,
  pattern: RegExp,
  whenMatch: DagNode,
  whenNoMatch: DagNode,
): DagDecisionNode {
  return {
    type: 'decision',
    name,
    children: [whenMatch, whenNoMatch],
    async pick(value) {
      return pattern.test(value) ? 0 : 1;
    },
  };
}

export function leaf(name: string, score: number, reasoning: string): DagLeafNode {
  return {
    type: 'leaf', name, score, reasoning,
  };
}
