const { Annotation, StateGraph, START, END } = require("@langchain/langgraph");

function createDecisionPipelineGraph(handlers = {}) {
  const {
    criticRevise,
    rankEvaluate,
    approvalPublish,
    postPublish,
  } = handlers;

  const DecisionPipelineState = Annotation.Root({
    input: Annotation(),
    turn: Annotation(),
  });

  return new StateGraph(DecisionPipelineState)
    .addNode("critic_revise", async (state) => ({
      turn: await criticRevise(state),
    }))
    .addNode("rank_evaluate", async (state) => ({
      turn: await rankEvaluate(state),
    }))
    .addNode("approval_publish", async (state) => ({
      turn: await approvalPublish(state),
    }))
    .addNode("post_publish", async (state) => ({
      turn: await postPublish(state),
    }))
    .addEdge(START, "critic_revise")
    .addEdge("critic_revise", "rank_evaluate")
    .addEdge("rank_evaluate", "approval_publish")
    .addEdge("approval_publish", "post_publish")
    .addEdge("post_publish", END)
    .compile();
}

module.exports = {
  createDecisionPipelineGraph,
};

