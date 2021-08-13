// export class LROneItem {
//   readonly production: Production;
//   readonly placeholderIndex: number;
//   readonly terminal: Terminal;
//   constructor(production: Production, placeholder: number, terminal: Terminal) {
//     this.production = production;
//     this.placeholderIndex = placeholder;
//     this.terminal = terminal;
//   }
//   getNext(): Symbol | undefined {
//     return this.production.symbols[this.placeholderIndex];
//   }
// }

// export function closure(grammar: Grammar, items: LROneItem[]) {
//   for (const item of items) {
//     const symbol = item.getNext(); // C in the example
//     if (symbol && symbol.kind == SymbolKind.NONTERMINAL) {
//       for (const production of grammar.productionsFrom(symbol)) {

//       }
//     }
//     for (const production of grammar.productionsIter()) {
//     }
//   }
// }

// class AdjancencyGraph<T> {
//   private nodes: { node: T; edges: number[] }[] = [];

//   addNode(node: T): number {
//     this.nodes.push({ node, edges: [] });
//     return this.nodes.length - 1;
//   }
//   addEdge(fromNodeId: number, toNodeId: number) {
//     const edges = this.nodes[fromNodeId].edges;
//     if (edges.indexOf(toNodeId) == -1) {
//       edges.push(toNodeId);
//     }
//   }
//   getNode(nodeId: number): T {
//     return this.nodes[nodeId].node;
//   }
//   getEdges(nodeId: number): Readonly<number[]> {
//     return this.nodes[nodeId].edges;
//   }
// }
