"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Button } from "@avenire/ui/components/button";

type Point = { x: number; y: number };
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

const GRID_SIZE = 20;
const CELL_SIZE = 18;
const GAME_SPEED_MS = 95;
const SEQUENCE = "IDDQD";
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;

const DIRECTION_VECTOR: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

function createInitialSnake(): Point[] {
  const center = Math.floor(GRID_SIZE / 2);
  return [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
}

function createFood(snake: Point[]): Point {
  const occupied = new Set(snake.map((segment) => `${segment.x}:${segment.y}`));
  const available: Point[] = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!occupied.has(`${x}:${y}`)) {
        available.push({ x, y });
      }
    }
  }

  if (available.length === 0) {
    return { x: 0, y: 0 };
  }

  return available[Math.floor(Math.random() * available.length)];
}

function toDirection(key: string): Direction | null {
  switch (key.toLowerCase()) {
    case "arrowup":
    case "w":
      return "UP";
    case "arrowdown":
    case "s":
      return "DOWN";
    case "arrowleft":
    case "a":
      return "LEFT";
    case "arrowright":
    case "d":
      return "RIGHT";
    default:
      return null;
  }
}

export default function NotFound() {
  const [isOpen, setIsOpen] = useState(false);
  const sequenceRef = useRef("");

  const initialSnake = createInitialSnake();
  const [snake, setSnake] = useState<Point[]>(initialSnake);
  const [food, setFood] = useState<Point>(() => createFood(initialSnake));
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const snakeRef = useRef<Point[]>(initialSnake);
  const foodRef = useRef<Point>(food);
  const directionRef = useRef<Direction>("RIGHT");
  const gameOverRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resetGame = useCallback(() => {
    const nextSnake = createInitialSnake();
    const nextFood = createFood(nextSnake);

    snakeRef.current = nextSnake;
    foodRef.current = nextFood;
    directionRef.current = "RIGHT";
    gameOverRef.current = false;

    setSnake(nextSnake);
    setFood(nextFood);
    setScore(0);
    setGameOver(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        return;
      }

      if (isOpen || event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      ) {
        return;
      }

      sequenceRef.current = `${sequenceRef.current}${event.key.toUpperCase()}`.slice(-SEQUENCE.length);
      if (sequenceRef.current === SEQUENCE) {
        sequenceRef.current = "";
        resetGame();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, resetGame]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if ((event.key === " " || event.key === "Enter") && gameOverRef.current) {
        event.preventDefault();
        resetGame();
        return;
      }

      const nextDirection = toDirection(event.key);
      if (!nextDirection) {
        return;
      }

      event.preventDefault();
      const currentDirection = directionRef.current;

      if (snakeRef.current.length > 1 && OPPOSITE_DIRECTION[currentDirection] === nextDirection) {
        return;
      }

      directionRef.current = nextDirection;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, resetGame]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const loop = window.setInterval(() => {
      if (gameOverRef.current) {
        return;
      }

      const currentSnake = snakeRef.current;
      const head = currentSnake[0];
      const vector = DIRECTION_VECTOR[directionRef.current];

      const nextHead = {
        x: head.x + vector.x,
        y: head.y + vector.y,
      };

      const hitWall = nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE;
      if (hitWall) {
        gameOverRef.current = true;
        setGameOver(true);
        return;
      }

      const collided = currentSnake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
      if (collided) {
        gameOverRef.current = true;
        setGameOver(true);
        return;
      }

      const nextSnake = [nextHead, ...currentSnake];
      const ateFood = nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y;

      if (!ateFood) {
        nextSnake.pop();
      } else {
        const nextFood = createFood(nextSnake);
        foodRef.current = nextFood;
        setFood(nextFood);
        setScore((prev) => prev + 1);
      }

      snakeRef.current = nextSnake;
      setSnake(nextSnake);
    }, GAME_SPEED_MS);

    return () => window.clearInterval(loop);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = "#0f1116";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.strokeStyle = "#1d232e";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i += 1) {
      const line = i * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(line, 0);
      ctx.lineTo(line, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(CANVAS_SIZE, line);
      ctx.stroke();
    }

    ctx.fillStyle = "#ff7862";
    ctx.fillRect(food.x * CELL_SIZE + 2, food.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);

    snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? "#84f0ad" : "#76d998";
      ctx.fillRect(segment.x * CELL_SIZE, segment.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    });

    if (gameOver) {
      ctx.fillStyle = "rgba(8, 9, 12, 0.72)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = "#f1f3f6";
      ctx.font = "bold 14px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 6);
      ctx.font = "12px JetBrains Mono, monospace";
      ctx.fillText("Press space to restart", CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 14);
    }
  }, [food, gameOver, isOpen, snake]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 pb-16 pt-28">
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="font-sans text-[clamp(5rem,17vw,15rem)] font-semibold leading-none tracking-tight">404 Error</h1>
          <p className="font-sans text-lg text-muted-foreground">This page doesn&apos;t exist or has been moved.</p>
        </div>
      </main>

      {isOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-[460px] rounded-lg border border-border bg-card p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-xs text-muted-foreground">Snake</p>
              <p className="font-mono text-xs text-muted-foreground">Score: {score}</p>
            </div>

            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="mx-auto block h-auto w-full max-w-[360px] rounded border border-border"
              aria-label="Snake game"
            />

            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">Arrows/WASD to move</p>
              <Button size="sm" variant="outline" onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
