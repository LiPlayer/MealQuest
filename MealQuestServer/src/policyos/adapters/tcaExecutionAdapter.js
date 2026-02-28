function createTcaExecutionAdapter({ pluginRegistry }) {
  if (!pluginRegistry) {
    throw new Error("pluginRegistry is required");
  }

  function compile({ policy, traceId }) {
    return {
      runtime: "TCA_ADAPTER_V1",
      traceId,
      commands: (policy.actions || []).map((action, index) => ({
        id: `${policy.policy_id}:action:${index + 1}`,
        plugin: action.plugin,
        channel: action.channel || "default",
        params: action.params || {}
      }))
    };
  }

  function explain({ policy, scoreResult, constraintResult }) {
    return {
      runtime: "TCA_ADAPTER_V1",
      policyId: policy.policy_id,
      reason_codes: [
        ...(constraintResult && constraintResult.reasonCodes ? constraintResult.reasonCodes : []),
        ...(scoreResult && scoreResult.reasonCodes ? scoreResult.reasonCodes : [])
      ],
      risk_flags: constraintResult && constraintResult.riskFlags ? constraintResult.riskFlags : [],
      expected_range: scoreResult && scoreResult.expectedRange ? scoreResult.expectedRange : null
    };
  }

  async function execute({ ctx, policy, plan, traceId }) {
    const responses = [];
    for (const command of plan.commands || []) {
      const plugin = pluginRegistry.get("action", command.plugin);
      if (!plugin || typeof plugin.execute !== "function") {
        responses.push({
          commandId: command.id,
          success: false,
          reasonCodes: [`action plugin missing: ${command.plugin}`]
        });
        continue;
      }
      const response = await plugin.execute({
        ctx,
        policy,
        action: command,
        traceId
      });
      responses.push({
        commandId: command.id,
        ...response
      });
    }
    const success = responses.every((item) => item.success !== false);
    return {
      success,
      responses
    };
  }

  return {
    compile,
    explain,
    execute
  };
}

module.exports = {
  createTcaExecutionAdapter
};
