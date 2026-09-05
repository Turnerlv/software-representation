import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

export function extractPayloadCollectionConfig(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (
    ts.isVariableDeclaration(node) &&
    node.name &&
    ts.isIdentifier(node.name) &&
    node.type &&
    ts.isTypeReferenceNode(node.type) &&
    ts.isIdentifier(node.type.typeName) &&
    node.type.typeName.text === 'CollectionConfig' &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    return {
      id: nextId(),
      name: `Payload Collection: ${node.name.text}`,
      type: 'BOUNDARY',
      entityType: 'PAYLOAD_COLLECTION',
      patternId: 'boundary.payload-collection-config',
      evidence: getEvidence(node),
    };
  }
  return null;
}
