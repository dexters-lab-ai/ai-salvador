import { GameId, parseGameId } from '../../convex/aiTown/ids';

export type SerializedAgentDescription = {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  btcGoal?: number;
};
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
