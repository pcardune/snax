import { Table } from './table';

test('toDebugStr()', () => {
  let table: Table<number> = Table.init(2, 3, () => 0);
  table.setCell(1, 1, 354);
  expect('\n' + table.toDebugStr()).toMatchInlineSnapshot(`
"
  0    0  0
  0  354  0
"
`);
});
