import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  btcGoal: number;

  constructor(serialized: SerializedAgentDescription) {
    const { agentId, identity, plan, btcGoal } = serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.plan = plan;
    this.btcGoal = btcGoal ?? 1;
  }

  serialize(): SerializedAgentDescription {
    const { agentId, identity, plan, btcGoal } = this;
    return { agentId, identity, plan, btcGoal };
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  btcGoal: v.optional(v.float64()),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;
