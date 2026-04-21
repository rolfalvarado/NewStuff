"use client";

import { useEffect, useRef, useState } from "react";

interface TetrisGameProps {
    onClose: () => void;
}

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 25;
const COLORS = [
    '#000000', // Empty
    '#FF0D72', // I
    '#0DC2FF', // J
    '#0DFF72', // L
    '#F538FF', // O
    '#FF8E0D', // S
    '#FFE138', // T
    '#3877FF', // Z
    '#FFFFFF', // Special 1x1 Image (Fallback)
];

const SHAPES = [
    [[1, 1, 1, 1]], // I
    [[2, 0, 0], [2, 2, 2]], // J
    [[0, 0, 3], [3, 3, 3]], // L
    [[4, 4], [4, 4]], // O
    [[0, 5, 5], [5, 5, 0]], // S
    [[0, 6, 0], [6, 6, 6]], // T
    [[7, 7, 0], [0, 7, 7]], // Z
    [[8]], // Special 1x1 piece
];

export default function TetrisGame({ onClose }: TetrisGameProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        // Load custom image
        const img = new Image();
        img.src = '/logos/una.jpeg';
        img.onload = () => {
            imageRef.current = img;
        };

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Game state
        let board: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        let currentPiece: { shape: number[][], x: number, y: number, color: number } | null = null;
        let dropCounter = 0;
        let dropInterval = 1000;
        let lastTime = 0;
        let localScore = 0;
        let animationFrameId: number;
        let isPaused = false;
        let isGameOver = false;

        // Create new piece
        const createPiece = () => {
            const shapeIndex = Math.floor(Math.random() * SHAPES.length);
            return {
                shape: SHAPES[shapeIndex],
                x: Math.floor(COLS / 2) - Math.floor(SHAPES[shapeIndex][0].length / 2),
                y: 0,
                color: shapeIndex + 1
            };
        };

        // Draw block
        const drawBlock = (x: number, y: number, color: number) => {
            if (color === 8 && imageRef.current) {
                ctx.drawImage(imageRef.current, x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            } else {
                ctx.fillStyle = COLORS[color];
                ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }
            ctx.strokeStyle = '#1a1a1a';
            ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        };

        // Draw board
        const drawBoard = () => {
            board.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        drawBlock(x, y, value);
                    }
                });
            });
        };

        // Draw current piece
        const drawPiece = () => {
            if (!currentPiece) return;
            currentPiece.shape.forEach((row, dy) => {
                row.forEach((value, dx) => {
                    if (value !== 0 && currentPiece) {
                        drawBlock(currentPiece.x + dx, currentPiece.y + dy, currentPiece.color);
                    }
                });
            });
        };

        // Check collision
        const collide = (piece: typeof currentPiece, offsetX = 0, offsetY = 0): boolean => {
            if (!piece) return false;
            for (let y = 0; y < piece.shape.length; y++) {
                for (let x = 0; x < piece.shape[y].length; x++) {
                    if (piece.shape[y][x] !== 0) {
                        const newX = piece.x + x + offsetX;
                        const newY = piece.y + y + offsetY;
                        if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                        if (newY >= 0 && board[newY][newX] !== 0) return true;
                    }
                }
            }
            return false;
        };

        // Merge piece to board
        const merge = () => {
            if (!currentPiece) return;
            currentPiece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0 && currentPiece) {
                        const boardY = currentPiece.y + y;
                        const boardX = currentPiece.x + x;
                        if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
                            board[boardY][boardX] = currentPiece.color;
                        }
                    }
                });
            });
        };

        // Clear lines
        const clearLines = () => {
            let linesCleared = 0;
            outer: for (let y = ROWS - 1; y >= 0; y--) {
                for (let x = 0; x < COLS; x++) {
                    if (board[y][x] === 0) continue outer;
                }
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(0));
                linesCleared++;
                y++;
            }
            if (linesCleared > 0) {
                localScore += linesCleared * 100;
                setScore(localScore);
            }
        };

        // Rotate piece
        const rotate = () => {
            if (!currentPiece) return;
            const rotated = currentPiece.shape[0].map((_, i) =>
                currentPiece!.shape.map(row => row[i]).reverse()
            );
            const previousShape = currentPiece.shape;
            currentPiece.shape = rotated;
            if (collide(currentPiece)) {
                currentPiece.shape = previousShape;
            }
        };

        // Move piece
        const move = (dir: number) => {
            if (!currentPiece) return;
            currentPiece.x += dir;
            if (collide(currentPiece)) {
                currentPiece.x -= dir;
            }
        };

        // Drop piece
        const drop = () => {
            if (!currentPiece) return;
            currentPiece.y++;
            if (collide(currentPiece)) {
                currentPiece.y--;
                merge();
                clearLines();
                currentPiece = createPiece();
                if (collide(currentPiece)) {
                    isGameOver = true;
                    setGameOver(true);
                }
            }
            dropCounter = 0;
        };

        // Hard drop
        const hardDrop = () => {
            if (!currentPiece) return;
            while (!collide(currentPiece, 0, 1)) {
                currentPiece.y++;
            }
            drop();
        };

        // Game loop
        const update = (time = 0) => {
            if (isPaused || isGameOver) {
                animationFrameId = requestAnimationFrame(update);
                return;
            }

            const deltaTime = time - lastTime;
            lastTime = time;
            dropCounter += deltaTime;

            if (dropCounter > dropInterval) {
                drop();
            }

            // Draw
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Grid
            ctx.strokeStyle = '#1a1a1a';
            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            }

            drawBoard();
            drawPiece();

            animationFrameId = requestAnimationFrame(update);
        };

        // Keyboard controls
        const handleKeyPress = (e: KeyboardEvent) => {
            if (isGameOver) return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    move(-1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    move(1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    drop();
                    break;
                case 'ArrowUp':
                case ' ':
                    e.preventDefault();
                    rotate();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    isPaused = !isPaused;
                    setPaused(isPaused);
                    break;
                case 'Escape':
                    onClose();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyPress);

        // Start game
        currentPiece = createPiece();
        animationFrameId = requestAnimationFrame(update);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
            cancelAnimationFrame(animationFrameId);
        };
    }, [onClose]);

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.95)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(5px)"
        }} onClick={onClose}>
            <div style={{
                backgroundColor: "#1a1a1a",
                padding: "20px",
                borderRadius: "8px",
                border: "2px solid #FF0D72",
                boxShadow: "0 0 50px rgba(255, 13, 114, 0.3)",
                position: "relative"
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    position: "absolute",
                    top: "-40px",
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    color: "#FF0D72",
                    fontFamily: "'Courier New', monospace",
                    fontSize: "24px",
                    fontWeight: "bold",
                    textShadow: "0 0 10px rgba(255, 13, 114, 0.8)"
                }}>
                    TETRIS
                </div>

                <div style={{
                    display: "flex",
                    gap: "20px"
                }}>
                    <canvas
                        ref={canvasRef}
                        width={COLS * BLOCK_SIZE}
                        height={ROWS * BLOCK_SIZE}
                        style={{
                            border: "2px solid #333",
                            backgroundColor: "#0a0a0a"
                        }}
                    />

                    <div style={{
                        color: "#fff",
                        fontFamily: "'Courier New', monospace",
                        fontSize: "14px",
                        minWidth: "150px"
                    }}>
                        <div style={{
                            marginBottom: "20px",
                            padding: "10px",
                            backgroundColor: "#222",
                            borderRadius: "4px"
                        }}>
                            <div style={{ color: "#FF0D72", marginBottom: "5px" }}>SCORE</div>
                            <div style={{ fontSize: "24px", fontWeight: "bold" }}>{score}</div>
                        </div>

                        <div style={{
                            padding: "10px",
                            backgroundColor: "#222",
                            borderRadius: "4px",
                            fontSize: "12px",
                            lineHeight: "1.6"
                        }}>
                            <div style={{ color: "#FF0D72", marginBottom: "10px", fontWeight: "bold" }}>CONTROLS</div>
                            <div>← → Move</div>
                            <div>↓ Soft Drop</div>
                            <div>↑/SPACE Rotate</div>
                            <div>P Pause</div>
                            <div>ESC Exit</div>
                        </div>

                        {paused && (
                            <div style={{
                                marginTop: "20px",
                                padding: "10px",
                                backgroundColor: "#FF0D72",
                                color: "#000",
                                borderRadius: "4px",
                                textAlign: "center",
                                fontWeight: "bold"
                            }}>
                                PAUSED
                            </div>
                        )}

                        {gameOver && (
                            <div style={{
                                marginTop: "20px",
                                padding: "10px",
                                backgroundColor: "#FF0D72",
                                color: "#000",
                                borderRadius: "4px",
                                textAlign: "center",
                                fontWeight: "bold"
                            }}>
                                GAME OVER
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
