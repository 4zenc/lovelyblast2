import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Trophy, 
  RotateCcw, 
  Heart, 
  Sparkles
} from 'lucide-react';
import { 
  BlockDefinition, 
  GameState, 
  Coordinate, 
  Affirmation 
} from './types';
import { 
  GRID_SIZE, 
  INITIAL_GRID, 
  generateRandomBlock, 
  AFFIRMATIONS_LIST 
} from './constants';
import { 
  canPlaceBlock, 
  placeBlockOnGrid, 
  checkClears, 
  clearGridCells,
  checkGameOver
} from './utils/gameLogic';
import { Block } from './components/Block';
import { supabase } from './utils/supabaseClient';

export default function App() {
  // -- State --
  const [grid, setGrid] = useState(INITIAL_GRID);
  const [trayBlocks, setTrayBlocks] = useState<(BlockDefinition | null)[]>([null, null, null]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  
  // Dragging State
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [ghostPos, setGhostPos] = useState<Coordinate | null>(null);
  
  // Visual Effects State
  const [affirmations, setAffirmations] = useState<Affirmation[]>([]);
  const [comboCount, setComboCount] = useState(0);
  
  // Refs
  const gridRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(null);

  // -- Initialization --
  useEffect(() => {
    // 1. Load High Score Local
    const saved = localStorage.getItem('lovelyBlastHighScore');
    if (saved) setHighScore(parseInt(saved, 10));

    // 2. Initialize User (Anon ID) & Sync Supabase
    const initUser = async () => {
      let uid = localStorage.getItem('lovely_blast_uid');
      if (!uid) {
        uid = crypto.randomUUID();
        localStorage.setItem('lovely_blast_uid', uid);
      }
      userIdRef.current = uid;

      try {
        // Upsert user to track last seen
        await supabase
          .from('users')
          .upsert({ id: uid, last_seen: new Date().toISOString() })
          .select();
          
        // Fetch remote high score if better
        const { data } = await supabase
          .from('scores')
          .select('score')
          .eq('user_id', uid)
          .single();
          
        if (data && data.score > (parseInt(saved || '0'))) {
          setHighScore(data.score);
          localStorage.setItem('lovelyBlastHighScore', data.score.toString());
        }
      } catch (err) {
        // Silently fail if table doesn't exist yet to prevent crashes
        console.warn("Supabase sync warning:", err);
      }
    };
    initUser();

    // 3. Fill Tray
    fillTray();
  }, []);

  // Sync High Score to Supabase
  useEffect(() => {
    if (highScore > 0 && userIdRef.current) {
      const syncScore = async () => {
        try {
          await supabase.from('scores').upsert({
            user_id: userIdRef.current,
            score: highScore,
            updated_at: new Date().toISOString()
          });
        } catch (e) {
          // ignore
        }
      };
      syncScore();
    }
  }, [highScore]);

  const fillTray = () => {
    const newBlocks = [generateRandomBlock(), generateRandomBlock(), generateRandomBlock()];
    setTrayBlocks(newBlocks);
  };

  const resetGame = () => {
    setGrid(INITIAL_GRID.map(row => row.map(c => ({...c}))));
    setScore(0);
    setGameOver(false);
    setComboCount(0);
    fillTray();
    setAffirmations([]);
  };

  // -- Logic Helpers --

  // Convert screen coordinates to grid coordinates
  const getGridPosition = (clientX: number, clientY: number, block: BlockDefinition): Coordinate | null => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    
    // Check if pointer is generally inside the grid area
    // Expanding area slightly to make dropping easier on edges
    const padding = 20; 
    if (
      clientX < rect.left - padding || 
      clientX > rect.right + padding || 
      clientY < rect.top - padding || 
      clientY > rect.bottom + padding
    ) {
      return null;
    }

    const cellSize = rect.width / GRID_SIZE;
    
    // Calculate the top-left cell of the block based on the pointer
    const blockWidth = block.shape[0].length * cellSize;
    const blockHeight = block.shape.length * cellSize;
    
    // Logic: dragPos is center of block
    const relativeX = clientX - rect.left - (blockWidth / 2) + (cellSize / 2);
    const relativeY = clientY - rect.top - (blockHeight / 2) + (cellSize / 2);

    const c = Math.round(relativeX / cellSize);
    const r = Math.round(relativeY / cellSize);

    return { r, c };
  };

  // -- Event Handlers --

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    if (gameOver) return;
    const block = trayBlocks[idx];
    if (!block) return;

    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
    const rect = target.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2
    };

    setActiveBlockIdx(idx);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeBlockIdx === null) return;
    e.preventDefault();

    setDragPos({ x: e.clientX, y: e.clientY });

    const block = trayBlocks[activeBlockIdx];
    if (block) {
      const gridPos = getGridPosition(e.clientX, e.clientY, block);
      if (gridPos && canPlaceBlock(grid, block, gridPos.r, gridPos.c)) {
        setGhostPos(gridPos);
      } else {
        setGhostPos(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeBlockIdx === null) return;
    e.preventDefault();
    
    const block = trayBlocks[activeBlockIdx];
    
    if (block && ghostPos) {
      // Place block
      const newGrid = placeBlockOnGrid(grid, block, ghostPos.r, ghostPos.c);
      
      // Check clears
      const clears = checkClears(newGrid);
      const totalCleared = clears.rowsToClear.size + clears.colsToClear.size + clears.boxesToClear.length;
      
      const finalGrid = clearGridCells(newGrid, clears);
      setGrid(finalGrid);
      
      // Update Score
      const placedPoints = block.shape.flat().filter(x => x === 1).length * 10;
      let clearPoints = 0;
      
      if (totalCleared > 0) {
        // Affirmation Trigger
        const randomAffirmation = AFFIRMATIONS_LIST[Math.floor(Math.random() * AFFIRMATIONS_LIST.length)];
        const rect = gridRef.current?.getBoundingClientRect();
        const popupX = rect ? rect.width / 2 : 0;
        const popupY = rect ? rect.height / 2 : 0;
        
        const newAffirm = {
            id: Date.now(),
            text: totalCleared > 1 ? `${randomAffirmation} x${totalCleared}` : randomAffirmation,
            x: popupX,
            y: popupY
        };
        setAffirmations(prev => [...prev, newAffirm]);
        setTimeout(() => {
            setAffirmations(prev => prev.filter(a => a.id !== newAffirm.id));
        }, 2000);

        // Score Calculation
        const comboMultiplier = comboCount + 1;
        clearPoints = (totalCleared * 100) * comboMultiplier;
        setComboCount(c => c + 1);
      } else {
        setComboCount(0);
      }

      const totalScore = score + placedPoints + clearPoints;
      setScore(totalScore);
      if (totalScore > highScore) {
        setHighScore(totalScore);
        localStorage.setItem('lovelyBlastHighScore', totalScore.toString());
      }

      // Remove from tray
      const newTray = [...trayBlocks];
      newTray[activeBlockIdx] = null;
      
      // Refill tray if empty
      if (newTray.every(b => b === null)) {
        const freshBlocks = [generateRandomBlock(), generateRandomBlock(), generateRandomBlock()];
        setTrayBlocks(freshBlocks);
      } else {
        setTrayBlocks(newTray);
        if (checkGameOver(finalGrid, newTray)) {
            setGameOver(true);
        }
      }

    }

    setActiveBlockIdx(null);
    setGhostPos(null);
  };

  // If tray was just refilled, check game over
  useEffect(() => {
     if (activeBlockIdx === null && !trayBlocks.every(b => b === null)) {
         if (checkGameOver(grid, trayBlocks)) {
             setGameOver(true);
         }
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayBlocks, grid]);

  // -- Render Helpers --

  // Dynamic grid cell sizing
  const [cellSize, setCellSize] = useState(0);
  useEffect(() => {
    const updateSize = () => {
      if (gridRef.current) {
        // Grid is square, width / 9
        const w = gridRef.current.clientWidth;
        setCellSize(w / GRID_SIZE);
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    setTimeout(updateSize, 100);
    return () => window.removeEventListener('resize', updateSize);
  }, []);


  return (
    <div 
      ref={containerRef}
      className="relative h-full flex flex-col items-center justify-between py-6 max-w-md mx-auto"
      onPointerMove={activeBlockIdx !== null ? handlePointerMove : undefined}
      onPointerUp={activeBlockIdx !== null ? handlePointerUp : undefined}
      onPointerLeave={activeBlockIdx !== null ? handlePointerUp : undefined}
    >
      
      {/* --- Header --- */}
      <div className="flex flex-col items-center w-full px-6">
        <h1 className="text-4xl font-pacifico text-sky-500 drop-shadow-sm mb-2">Lovely Blast ♡</h1>
        
        <div className="flex w-full justify-between items-end mt-2">
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-3 flex flex-col items-center shadow-sm w-28">
                <span className="text-xs text-sky-400 font-bold uppercase tracking-wider">High Score</span>
                <div className="flex items-center gap-1 text-sky-600">
                    <Trophy size={16} />
                    <span className="font-bold text-xl">{highScore}</span>
                </div>
            </div>
            
            <div className="flex-1 flex justify-center">
                 {/* Decorative Center */}
                 <div className="bg-lovely-pink/50 p-2 rounded-full animate-pulse">
                    <Heart className="text-pink-500 fill-pink-500" size={24} />
                 </div>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-3 flex flex-col items-center shadow-sm w-28 border-2 border-sky-200">
                <span className="text-xs text-sky-400 font-bold uppercase tracking-wider">Score</span>
                <span className="font-extrabold text-2xl text-sky-600">{score}</span>
            </div>
        </div>
      </div>

      {/* --- Game Board --- */}
      <div className="w-full px-4 flex-1 flex items-center justify-center my-4">
        <div 
            ref={gridRef}
            className="w-full aspect-square bg-white/40 backdrop-blur-xl rounded-xl p-2 shadow-[0_8px_32px_rgba(31,38,135,0.1)] border border-white/50 grid gap-1 relative"
            style={{
                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`
            }}
        >
          {/* 3x3 Background Hints (Sudoku style borders) */}
          <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden border-2 border-sky-100">
             <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                {[...Array(9)].map((_, i) => (
                    <div key={i} className="border border-sky-200/50" />
                ))}
             </div>
          </div>

          {/* Cells */}
          {grid.map((row, r) => 
            row.map((cell, c) => {
              let isGhost = false;
              if (activeBlockIdx !== null && ghostPos && trayBlocks[activeBlockIdx]) {
                 const shape = trayBlocks[activeBlockIdx]!.shape;
                 const localR = r - ghostPos.r;
                 const localC = c - ghostPos.c;
                 if (localR >= 0 && localR < shape.length && localC >= 0 && localC < shape[0].length) {
                    if (shape[localR][localC] === 1) isGhost = true;
                 }
              }

              return (
                <div 
                    key={`${r}-${c}`} 
                    className={`
                        rounded-sm transition-colors duration-200 relative
                        ${cell.filled 
                            ? `${cell.color} shadow-sm border-white/20 border` 
                            : 'bg-sky-900/5'}
                        ${isGhost ? 'bg-sky-400/40' : ''}
                    `}
                >
                    {cell.filled && (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-sm" />
                    )}
                </div>
              );
            })
          )}
          
          {/* Affirmation Overlays */}
          {affirmations.map(aff => (
              <div 
                key={aff.id}
                className="absolute z-20 pointer-events-none animate-float-up text-center w-64"
                style={{ 
                    left: '50%', 
                    top: '40%',
                    marginLeft: '-8rem'
                }}
              >
                  <div className="font-pacifico text-3xl text-pink-500 drop-shadow-md flex flex-col items-center">
                    <span>{aff.text}</span>
                    <Sparkles size={20} className="text-yellow-400 mt-1" />
                  </div>
              </div>
          ))}
        </div>
      </div>

      {/* --- Block Tray --- */}
      <div className="w-full px-6 mb-8 h-32">
        <div className="flex justify-between items-center h-full">
            {trayBlocks.map((block, idx) => (
                <div 
                    key={idx} 
                    className="w-1/3 flex justify-center items-center h-24 relative"
                    onPointerDown={(e) => handlePointerDown(e, idx)}
                >
                    {block && activeBlockIdx !== idx && (
                         <div className="transform transition-transform hover:scale-105 active:scale-95 touch-manipulation cursor-grab">
                             <Block shape={block.shape} color={block.color} cellSize={16} />
                         </div>
                    )}
                    {block && activeBlockIdx === idx && (
                        <div className="opacity-20 transform scale-90">
                            <Block shape={block.shape} color={block.color} cellSize={16} />
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>

      {/* --- Footer --- */}
      <div className="text-center text-sky-400/80 text-xs font-semibold pb-2">
        Made with ♡ by Kashif for his Good Girl
      </div>

      {/* --- Drag Overlay --- */}
      {activeBlockIdx !== null && trayBlocks[activeBlockIdx] && (
          <div 
            className="fixed z-50 pointer-events-none"
            style={{
                left: dragPos.x,
                top: dragPos.y,
                transform: `translate(-50%, -150%) scale(1.2)`,
            }}
          >
             <div className="drop-shadow-2xl opacity-90">
                <Block 
                    shape={trayBlocks[activeBlockIdx]!.shape} 
                    color={trayBlocks[activeBlockIdx]!.color} 
                    cellSize={cellSize || 30} 
                />
             </div>
          </div>
      )}

      {/* --- Game Over Modal --- */}
      {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-sky-900/40 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-2xl text-center transform scale-100 animate-pop">
                  <div className="mb-4 inline-block bg-pink-100 p-4 rounded-full">
                    <Heart size={40} className="text-pink-500 fill-pink-500" />
                  </div>
                  <h2 className="text-3xl font-pacifico text-sky-600 mb-2">Good Try Baby!</h2>
                  <p className="text-gray-500 mb-6 font-nunito">
                    You did amazing! Kashif is so proud of you.<br/>
                    <span className="font-bold text-sky-500 mt-2 block text-lg">Score: {score}</span>
                  </p>
                  
                  <button 
                    onClick={resetGame}
                    className="w-full py-3 bg-sky-400 hover:bg-sky-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-sky-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                      <RotateCcw size={20} />
                      Play Again
                  </button>
              </div>
          </div>
      )}
    </div>
  );
}