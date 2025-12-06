import { CellData, BlockDefinition, Coordinate } from '../types';
import { GRID_SIZE } from '../constants';

// Check if a block can be placed at a specific grid coordinate (top-left of block)
export const canPlaceBlock = (
  grid: CellData[][],
  block: BlockDefinition,
  startRow: number,
  startCol: number
): boolean => {
  const { shape } = block;
  const rows = shape.length;
  const cols = shape[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shape[r][c] === 1) {
        const gridR = startRow + r;
        const gridC = startCol + c;

        // Out of bounds
        if (gridR < 0 || gridR >= GRID_SIZE || gridC < 0 || gridC >= GRID_SIZE) {
          return false;
        }

        // Already filled
        if (grid[gridR][gridC].filled) {
          return false;
        }
      }
    }
  }
  return true;
};

// Place the block and return a new grid
export const placeBlockOnGrid = (
  grid: CellData[][],
  block: BlockDefinition,
  startRow: number,
  startCol: number
): CellData[][] => {
  const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
  const { shape, color } = block;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (shape[r][c] === 1) {
        newGrid[startRow + r][startCol + c] = {
          filled: true,
          color: color,
          id: block.id
        };
      }
    }
  }
  return newGrid;
};

// Check for completed rows, columns, and 3x3 subgrids
export const checkClears = (grid: CellData[][]) => {
  const rowsToClear = new Set<number>();
  const colsToClear = new Set<number>();
  const boxesToClear: Coordinate[] = []; // top-left coordinates of cleared 3x3 boxes

  // 1. Check Rows
  for (let r = 0; r < GRID_SIZE; r++) {
    if (grid[r].every(cell => cell.filled)) {
      rowsToClear.add(r);
    }
  }

  // 2. Check Cols
  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (!grid[r][c].filled) {
        full = false;
        break;
      }
    }
    if (full) colsToClear.add(c);
  }

  // 3. Check 3x3 Boxes (Sudoku style)
  // 3x3 regions start at 0, 3, 6
  for (let br = 0; br < GRID_SIZE; br += 3) {
    for (let bc = 0; bc < GRID_SIZE; bc += 3) {
      let full = true;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (!grid[br + r][bc + c].filled) {
            full = false;
            break;
          }
        }
      }
      if (full) {
        boxesToClear.push({ r: br, c: bc });
      }
    }
  }

  return { rowsToClear, colsToClear, boxesToClear };
};

// Clear the identified cells
export const clearGridCells = (
  grid: CellData[][],
  clears: { rowsToClear: Set<number>, colsToClear: Set<number>, boxesToClear: Coordinate[] }
): CellData[][] => {
  if (clears.rowsToClear.size === 0 && clears.colsToClear.size === 0 && clears.boxesToClear.length === 0) {
    return grid;
  }

  const newGrid = grid.map(row => row.map(cell => ({ ...cell })));

  // Clear Rows
  clears.rowsToClear.forEach(r => {
    for (let c = 0; c < GRID_SIZE; c++) newGrid[r][c] = { filled: false, color: null, id: null };
  });

  // Clear Cols
  clears.colsToClear.forEach(c => {
    for (let r = 0; r < GRID_SIZE; r++) newGrid[r][c] = { filled: false, color: null, id: null };
  });

  // Clear Boxes
  clears.boxesToClear.forEach(({ r: br, c: bc }) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        newGrid[br + r][bc + c] = { filled: false, color: null, id: null };
      }
    }
  });

  return newGrid;
};

// Check if game is over (no pieces in tray can be placed)
export const checkGameOver = (grid: CellData[][], trayBlocks: (BlockDefinition | null)[]): boolean => {
  const activeBlocks = trayBlocks.filter((b): b is BlockDefinition => b !== null);
  if (activeBlocks.length === 0) return false;

  for (const block of activeBlocks) {
    // Try every position
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (canPlaceBlock(grid, block, r, c)) {
          return false; // Found a valid move
        }
      }
    }
  }
  return true;
};
