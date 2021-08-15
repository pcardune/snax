import { IHaveDebugStr } from '../debug';

export interface ConstTable<D> extends IHaveDebugStr {
  numRows: number;
  numCols: number;
  getCell(row: number, col: number): D;
}

export interface MutTable<D> extends ConstTable<D> {
  /**
   * Add a row to the table where each
   * cell in the row has the given
   * value.
   */
  addRow(value: () => D): void;

  /**
   * Add a column to the table where each
   * cell in the column has the given value
   */
  addCol(value: () => D): void;

  /**
   * Set the value of the cell at the given row/col to the given value.
   */
  setCell(row: number, col: number, value: D): void;
}

export class Table<D> implements MutTable<D> {
  private rows: D[][] = [];
  private _numCols: number = 0;
  get numRows() {
    return this.rows.length;
  }
  get numCols() {
    return this._numCols;
  }

  static init<D>(numRows: number, numCols: number, value: () => D) {
    let table: Table<D> = new Table();
    for (let row = 0; row < numRows; row++) {
      table.addRow(value);
    }
    for (let col = 0; col < numCols; col++) {
      table.addCol(value);
    }
    return table;
  }

  /**
   * Add a row to the table where each
   * cell in the row has the given
   * value.
   */
  addRow(value: () => D) {
    let cols: D[] = [];
    for (let c = 0; c < this._numCols; c++) {
      cols.push(value());
    }
    this.rows.push(cols);
  }

  /**
   * Add a column to the table where each
   * cell in the column has the given value
   */
  addCol(value: () => D) {
    this._numCols++;
    for (let rowi = 0; rowi < this.rows.length; rowi++) {
      this.rows[rowi].push(value());
    }
  }

  /**
   * Set the value of the cell at the given row/col to the given value.
   */
  setCell(row: number, col: number, value: D) {
    if (row < 0 || row >= this.rows.length) {
      throw new Error(
        `TableIndexError: Invalid row ${row}. Must be between 0 and ${this.rows.length} inclusive`
      );
    }
    if (col < 0 || col >= this._numCols) {
      throw new Error(
        `TableIndexError: Invalid col ${col}. Must be between 0 and ${this._numCols} inclusive`
      );
    }
    this.rows[row][col] = value;
  }

  /**
   *
   * @param row
   * @param col
   * @returns The value of the cell with the given row/col
   */
  getCell(row: number, col: number): D {
    return this.rows[row][col];
  }

  /**
   * return a debug string for the table.
   */
  toDebugStr() {
    let out = '';
    let minWidths: number[] = [];
    for (let ci = 0; ci < this.numCols; ci++) {
      let minWidth = 1;
      for (let ri = 0; ri < this.numRows; ri++) {
        minWidth = Math.max(minWidth, `${this.getCell(ri, ci)}`.length);
      }
      minWidths.push(minWidth);
    }

    for (let row = 0; row < this.numRows; row++) {
      let width = 0;
      for (let col = 0; col < this.numCols; col++) {
        let minWidth = minWidths[col];
        let s = `${this.getCell(row, col)}`.padStart(minWidth + 2);
        width += s.length;
        out += s;
      }
      out += '\n';
    }
    return out;
  }
}

export class DefaultTable<D> extends Table<D> {
  private makeDefault: () => D;
  constructor(makeDefault: () => D) {
    super();
    this.makeDefault = makeDefault;
  }

  static init<D>(numRows: number, numCols: number, makeDefault: () => D) {
    let table = new DefaultTable(makeDefault);
    for (let row = 0; row < numRows; row++) {
      table.addRow();
    }
    for (let col = 0; col < numCols; col++) {
      table.addCol();
    }
    return table;
  }

  override addRow() {
    super.addRow(this.makeDefault);
  }
  override addCol() {
    super.addCol(this.makeDefault);
  }
}
