import { ObjectType, v } from 'convex/values';
import { agentId } from './ids';
import {
  AgentDescription as AgentDescriptionClass,
  SerializedAgentDescription,
} from '../../src/shared/agentDescription';

// Fix: Exporting as a class makes it available as both a value (constructor) and a type.
export class AgentDescription extends AgentDescriptionClass {}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  btcGoal: v.optional(v.float64()),
};