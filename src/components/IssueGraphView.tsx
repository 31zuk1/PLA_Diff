"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { cn } from "@/lib/utils";

export type IssueGraphNodeSource = "people_daily" | "pla_daily" | "people" | "81cn";
export type IssueGraphNodeMatchState = "matched" | "isolated";

export interface IssueGraphNode {
  id: string;
  title: string;
  source: IssueGraphNodeSource;
  pageNumber?: number;
  pageName?: string;
  degree?: number;
  matchState?: IssueGraphNodeMatchState;
  matched?: boolean;
  confidence?: number;
}

export interface IssueGraphLink {
  id?: string;
  source: string;
  target: string;
  weight?: number;
  confidence?: number;
  matchType?: string;
}

export interface IssueGraphData {
  nodes: readonly IssueGraphNode[];
  links: readonly IssueGraphLink[];
}

export interface IssueGraphViewProps {
  graph?: IssueGraphData | null;
  issueDate?: string;
  selectedDate?: string;
  availableDates?: readonly string[];
  viewFilter?: string;
  sortMode?: string;
  initiallyExpanded?: boolean;
  className?: string;
  title?: string;
}

type CanonicalSource = "people_daily" | "pla_daily";

type SimNode = Omit<IssueGraphNode, "degree" | "matchState" | "source"> &
  SimulationNodeDatum & {
    source: CanonicalSource;
    degree: number;
    matchState: IssueGraphNodeMatchState;
    radius: number;
    targetX: number;
    targetY: number;
  };

type SimLink = SimulationLinkDatum<SimNode> & {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
  weight: number;
  confidence: number;
  matchType?: string;
};

type CanvasSize = {
  width: number;
  height: number;
};

type HoverState = {
  node: SimNode;
  x: number;
  y: number;
};

const compactCanvasHeight = 420;
const roomyCanvasHeight = 560;

export function IssueGraphView({
  graph,
  issueDate,
  selectedDate,
  availableDates = [],
  viewFilter = "all",
  sortMode = "relevance",
  initiallyExpanded = false,
  className,
  title = "Issue graph",
}: IssueGraphViewProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<HoverState | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const hoveredNodeRef = useRef<SimNode | null>(null);
  const draggedNodeRef = useRef<SimNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const summary = useMemo(() => summarizeGraph(graph), [graph]);
  const dateNavigation = useMemo(
    () => buildDateNavigation(availableDates, selectedDate ?? issueDate),
    [availableDates, issueDate, selectedDate],
  );

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const scaledWidth = Math.floor(canvasSize.width * dpr);
    const scaledHeight = Math.floor(canvasSize.height * dpr);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackground(context, canvasSize, isDarkMode);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    if (nodes.length === 0) {
      paintEmptyGraph(context, canvasSize, isDarkMode);
      return;
    }

    for (const node of nodes) {
      keepNodeInCanvas(node, canvasSize);
    }

    paintLinks(context, links, isDarkMode);
    paintNodes(context, nodes, hoveredNodeRef.current?.id, isDarkMode);
  }, [canvasSize, isDarkMode]);

  const scheduleDraw = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      drawGraph();
    });
  }, [drawGraph]);

  useEffect(() => {
    const root = document.documentElement;
    const syncDarkMode = () => {
      setIsDarkMode(root.classList.contains("dark"));
    };
    const observer = new MutationObserver(syncDarkMode);

    syncDarkMode();
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const shell = canvasShellRef.current;

    if (!shell) {
      return;
    }

    const updateSize = () => {
      const rect = shell.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.floor(rect.width));
      const fallbackHeight = nextWidth < 720 ? compactCanvasHeight : roomyCanvasHeight;
      const nextHeight = Math.max(360, Math.floor(rect.height || fallbackHeight));

      setCanvasSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(shell);

    return () => {
      observer.disconnect();
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const simulationGraph = buildSimulationGraph(graph, canvasSize);

    nodesRef.current = simulationGraph.nodes;
    linksRef.current = simulationGraph.links;
    hoveredNodeRef.current = null;
    draggedNodeRef.current = null;
    const clearHoverTimer = window.setTimeout(() => {
      setHoveredNode(null);
    }, 0);

    const simulation = forceSimulation<SimNode, SimLink>(simulationGraph.nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simulationGraph.links)
          .id((node) => node.id)
          .distance((link) => Math.max(96, 168 - link.confidence * 48 - link.weight * 22))
          .strength((link) => 0.03 + link.confidence * 0.08),
      )
      .force("charge", forceManyBody<SimNode>().strength((node) => (node.matchState === "matched" ? -138 : -88)))
      .force("collision", forceCollide<SimNode>().radius((node) => node.radius + 12).iterations(2))
      .force("x", forceX<SimNode>((node) => node.targetX).strength((node) => (node.matchState === "matched" ? 0.24 : 0.16)))
      .force("y", forceY<SimNode>((node) => node.targetY).strength((node) => (node.matchState === "matched" ? 0.24 : 0.16)))
      .force("center", forceCenter(canvasSize.width / 2, canvasSize.height / 2))
      .alpha(0.9)
      .alphaDecay(0.035)
      .on("tick", scheduleDraw);

    simulation.tick(24);
    simulationRef.current = simulation;
    scheduleDraw();

    return () => {
      window.clearTimeout(clearHoverTimer);
      simulation.stop();
      simulationRef.current = null;

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [canvasSize, expanded, graph, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [isDarkMode, scheduleDraw]);

  const clearHover = useCallback(() => {
    hoveredNodeRef.current = null;
    setHoveredNode(null);
    scheduleDraw();
  }, [scheduleDraw]);

  const updateHover = useCallback(
    (node: SimNode | null, point: CanvasPoint) => {
      hoveredNodeRef.current = node;

      if (!node) {
        setHoveredNode(null);
        scheduleDraw();
        return;
      }

      const tooltipWidth = 268;
      const tooltipHeight = 136;
      const x = clamp(point.x + 14, 10, Math.max(10, canvasSize.width - tooltipWidth - 10));
      const y = clamp(point.y + 14, 10, Math.max(10, canvasSize.height - tooltipHeight - 10));

      setHoveredNode({ node, x, y });
      scheduleDraw();
    },
    [canvasSize, scheduleDraw],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = canvasPointFromEvent(event, canvasSize);
      const draggedNode = draggedNodeRef.current;

      if (draggedNode) {
        draggedNode.fx = point.x;
        draggedNode.fy = point.y;
        updateHover(draggedNode, point);
        simulationRef.current?.alphaTarget(0.18).restart();
        return;
      }

      updateHover(findNodeAtPoint(nodesRef.current, point), point);
    },
    [canvasSize, updateHover],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = canvasPointFromEvent(event, canvasSize);
      const node = findNodeAtPoint(nodesRef.current, point);

      if (!node) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      draggedNodeRef.current = node;
      node.fx = point.x;
      node.fy = point.y;
      updateHover(node, point);
      simulationRef.current?.alphaTarget(0.22).restart();
    },
    [canvasSize, updateHover],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const node = draggedNodeRef.current;

    if (!node) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    node.fx = null;
    node.fy = null;
    draggedNodeRef.current = null;
    simulationRef.current?.alphaTarget(0);
  }, []);

  return (
    <section
      id="issue-graph"
      className={cn(
        "overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-950",
        className,
      )}
    >
      <header className="border-b border-stone-200 bg-stone-100/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Graph view
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-stone-950 dark:text-stone-50">
              {issueDate ? `${formatIssueDate(issueDate)} ${title}` : title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <GraphScopePill label="All-day articles" />
              <GraphScopePill label="Group-expanded links" />
              <GraphScopePill label={`Cards: ${viewLabel(viewFilter)}`} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GraphMetric label="People" value={summary.peopleNodes} tone="people" />
            <GraphMetric label="81cn" value={summary.plaNodes} tone="pla" />
            <GraphMetric label="Links" value={summary.links} tone="neutral" />
            <button
              type="button"
              className="h-9 rounded-sm border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:border-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:border-stone-500"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "閉じる" : "開く"}
            </button>
          </div>
        </div>

        {expanded && dateNavigation.dates.length > 0 ? (
          <nav className="mt-3 flex flex-wrap items-center gap-2" aria-label="Issue graph dates">
            <DateNavLink label="前" date={dateNavigation.previousDate} viewFilter={viewFilter} sortMode={sortMode} />
            <DateNavLink label="次" date={dateNavigation.nextDate} viewFilter={viewFilter} sortMode={sortMode} />
            <DateNavLink label="最新" date={dateNavigation.latestDate} viewFilter={viewFilter} sortMode={sortMode} strong />
            <div className="flex flex-wrap gap-1.5">
              {dateNavigation.chipDates.map((date) => (
                <Link
                  key={date}
                  href={dateHref(date, viewFilter, sortMode)}
                  aria-current={date === dateNavigation.activeDate ? "date" : undefined}
                  className={cn(
                    "rounded-sm border px-2 py-1 text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900",
                    date === dateNavigation.activeDate
                      ? "border-teal-500 bg-teal-50 text-teal-900 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.18)] dark:border-teal-500 dark:bg-teal-950/45 dark:text-teal-100"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:border-stone-500",
                  )}
                >
                  {formatIssueDate(date)}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      {expanded ? (
        <div
          ref={canvasShellRef}
          className="relative h-[420px] min-h-[360px] w-full bg-stone-50 dark:bg-stone-950 md:h-[560px]"
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${title}: ${summary.nodes} nodes and ${summary.links} weighted links`}
            className="block h-full w-full touch-none cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerLeave={clearHover}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />

          {summary.nodes === 0 ? <EmptyState /> : null}
          {hoveredNode ? <NodeTooltip hover={hoveredNode} /> : null}
          <GraphLegend />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 px-4 py-2 text-xs font-semibold text-stone-500 dark:border-stone-800 dark:text-stone-400">
          <span>Matched nodes {summary.matchedNodes}</span>
          <span>Isolated nodes {summary.isolatedNodes}</span>
          <span>Avg confidence {summary.averageConfidenceLabel}</span>
          <span>Issue date {issueDate ? formatIssueDate(issueDate) : "未選択"}</span>
        </div>
      )}
    </section>
  );
}

function GraphMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "people" | "pla" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-semibold",
        tone === "people" && "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-200",
        tone === "pla" && "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-200",
        tone === "neutral" && "border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200",
      )}
    >
      <span>{label}</span>
      <span>{value}</span>
    </span>
  );
}

function DateNavLink({
  label,
  date,
  viewFilter,
  sortMode,
  strong = false,
}: {
  label: string;
  date?: string;
  viewFilter: string;
  sortMode: string;
  strong?: boolean;
}) {
  if (!date) {
    return (
      <span className="rounded-sm border border-stone-200 bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-600">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={dateHref(date, viewFilter, sortMode)}
      className={cn(
        "rounded-sm border px-2 py-1 text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900",
        strong
          ? "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-400 hover:bg-teal-100 dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-200 dark:hover:border-teal-500"
          : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:border-stone-500",
      )}
    >
      {label}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
      <div className="rounded-md border border-stone-200 bg-white/90 px-4 py-3 text-center text-sm font-semibold text-stone-600 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/90 dark:text-stone-300">
        Graph data is empty
      </div>
    </div>
  );
}

function NodeTooltip({ hover }: { hover: HoverState }) {
  const { node } = hover;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 w-[calc(100%-20px)] max-w-[268px] rounded-md border border-stone-200 bg-white/95 p-3 text-xs leading-5 text-stone-600 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-950/95 dark:text-stone-300"
      style={{ transform: `translate(${hover.x}px, ${hover.y}px)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-semibold leading-5 text-stone-950 dark:text-stone-50">
          {node.title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
            node.source === "people_daily"
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-200"
              : "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800/70 dark:bg-teal-950/60 dark:text-teal-200",
          )}
        >
          {node.source === "people_daily" ? "People" : "81cn"}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-stone-100 pt-2 dark:border-stone-800">
        <TooltipDatum label="Page" value={node.pageNumber ? `${node.pageNumber}面` : node.pageName ?? "-"} />
        <TooltipDatum label="Degree" value={`${node.degree}`} />
        <TooltipDatum label="State" value={node.matchState} />
        <TooltipDatum label="Confidence" value={formatPercent(node.confidence)} />
      </dl>
    </div>
  );
}

function TooltipDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-stone-400 dark:text-stone-500">{label}</dt>
      <dd className="font-semibold text-stone-700 dark:text-stone-200">{value}</dd>
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-md border border-stone-200 bg-white/88 px-3 py-2 text-[11px] font-semibold text-stone-600 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/88 dark:text-stone-300">
      <LegendItem colorClass="bg-rose-600 dark:bg-rose-400" label="People" />
      <LegendItem colorClass="bg-teal-600 dark:bg-teal-300" label="81cn" />
      <span className="text-stone-400 dark:text-stone-500">size: matched / degree</span>
      <span className="text-stone-400 dark:text-stone-500">line: group-expanded review link</span>
    </div>
  );
}

function GraphScopePill({ label }: { label: string }) {
  return (
    <span className="rounded-sm border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400">
      {label}
    </span>
  );
}

function LegendItem({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", colorClass)} />
      {label}
    </span>
  );
}

function summarizeGraph(graph?: IssueGraphData | null) {
  const nodes = graph?.nodes ?? [];
  const links = graph?.links ?? [];
  const degreeById = buildDegreeMap(nodes, links);
  const peopleNodes = nodes.filter((node) => canonicalSource(node.source) === "people_daily").length;
  const plaNodes = nodes.filter((node) => canonicalSource(node.source) === "pla_daily").length;
  const matchedNodes = nodes.filter((node) => inferMatchState(node, degreeById.get(node.id) ?? 0) === "matched").length;
  const confidenceValues = links.map((link) => normalizeMetric(link.confidence ?? link.weight)).filter((value) => value > 0);
  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
      : undefined;

  return {
    nodes: nodes.length,
    peopleNodes,
    plaNodes,
    links: links.length,
    matchedNodes,
    isolatedNodes: Math.max(0, nodes.length - matchedNodes),
    averageConfidenceLabel: averageConfidence === undefined ? "-" : formatPercent(averageConfidence),
  };
}

function buildSimulationGraph(graph: IssueGraphData | null | undefined, canvasSize: CanvasSize) {
  const rawNodes = graph?.nodes ?? [];
  const rawLinks = graph?.links ?? [];
  const degreeById = buildDegreeMap(rawNodes, rawLinks);
  const nodeIds = new Set(rawNodes.map((node) => node.id));
  const ringIndexById = buildRingIndex(rawNodes);
  const nodes: SimNode[] = rawNodes.map((node, index) => {
    const source = canonicalSource(node.source);
    const computedDegree = degreeById.get(node.id) ?? 0;
    const degree = Math.max(computedDegree, node.degree ?? 0);
    const matchState = inferMatchState(node, computedDegree);
    const radius = nodeRadius(matchState, degree);
    const ringPoint = graphRingPoint(
      ringIndexById.get(node.id) ?? index,
      rawNodes.length,
      canvasSize,
    );

    return {
      ...node,
      source,
      degree,
      matchState,
      radius,
      targetX: ringPoint.x,
      targetY: ringPoint.y,
      x: ringPoint.x + seededJitter(node.id, 14),
      y: ringPoint.y + seededJitter(`${node.id}:y`, 14),
    };
  });
  const links: SimLink[] = rawLinks
    .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
    .map((link, index) => ({
      id: link.id ?? `${link.source}-${link.target}-${index}`,
      source: link.source,
      target: link.target,
      weight: normalizeMetric(link.weight ?? link.confidence),
      confidence: normalizeMetric(link.confidence ?? link.weight),
      matchType: link.matchType,
    }));

  return { nodes, links };
}

function buildRingIndex(nodes: readonly IssueGraphNode[]) {
  return new Map(
    [...nodes]
      .sort((left, right) => seededUnit(left.id) - seededUnit(right.id))
      .map((node, index) => [node.id, index]),
  );
}

function graphRingPoint(index: number, total: number, canvasSize: CanvasSize) {
  const safeTotal = Math.max(1, total);
  const angle = ((index + 0.5) / safeTotal) * Math.PI * 2 - Math.PI / 2;
  const horizontalPadding = canvasSize.width < 720 ? 56 : 84;
  const verticalPadding = canvasSize.height < 460 ? 54 : 74;
  const radiusX = Math.max(92, canvasSize.width / 2 - horizontalPadding);
  const radiusY = Math.max(92, canvasSize.height / 2 - verticalPadding);

  return {
    x: canvasSize.width / 2 + Math.cos(angle) * radiusX,
    y: canvasSize.height / 2 + Math.sin(angle) * radiusY,
  };
}

function buildDegreeMap(nodes: readonly IssueGraphNode[], links: readonly IssueGraphLink[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const degreeById = new Map<string, number>();

  for (const node of nodes) {
    degreeById.set(node.id, 0);
  }

  for (const link of links) {
    if (nodeIds.has(link.source)) {
      degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
    }

    if (nodeIds.has(link.target)) {
      degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
    }
  }

  return degreeById;
}

function inferMatchState(node: IssueGraphNode, computedDegree: number): IssueGraphNodeMatchState {
  if (node.matchState) {
    return node.matchState;
  }

  if (typeof node.matched === "boolean") {
    return node.matched ? "matched" : "isolated";
  }

  return computedDegree > 0 ? "matched" : "isolated";
}

function nodeRadius(matchState: IssueGraphNodeMatchState, degree: number) {
  const baseRadius = matchState === "matched" ? 7.5 : 5.75;
  return baseRadius + Math.min(5.5, Math.sqrt(Math.max(0, degree)) * 2.1);
}

function canonicalSource(source: IssueGraphNodeSource): CanonicalSource {
  return source === "pla_daily" || source === "81cn" ? "pla_daily" : "people_daily";
}

function buildDateNavigation(availableDates: readonly string[], activeDate?: string) {
  const dates = [...new Set(availableDates)].filter(Boolean).sort();
  const resolvedActiveDate = activeDate ?? dates[dates.length - 1];
  const activeIndex = resolvedActiveDate ? dates.indexOf(resolvedActiveDate) : -1;
  const latestDate = dates[dates.length - 1];
  const baseChipDates = dates.slice(Math.max(0, dates.length - 14)).reverse();
  const chipDates =
    resolvedActiveDate && dates.includes(resolvedActiveDate) && !baseChipDates.includes(resolvedActiveDate)
      ? [...baseChipDates, resolvedActiveDate]
      : baseChipDates;

  return {
    dates,
    activeDate: resolvedActiveDate,
    previousDate: activeIndex > 0 ? dates[activeIndex - 1] : undefined,
    nextDate: activeIndex >= 0 && activeIndex < dates.length - 1 ? dates[activeIndex + 1] : undefined,
    latestDate,
    chipDates,
  };
}

function dateHref(date: string, viewFilter: string, sortMode: string) {
  const params = new URLSearchParams({
    date,
    view: viewFilter,
    sort: sortMode,
  });

  return `/?${params.toString()}#issue-graph`;
}

function canvasPointFromEvent(event: React.PointerEvent<HTMLCanvasElement>, canvasSize: CanvasSize) {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvasSize.width,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvasSize.height,
  };
}

type CanvasPoint = ReturnType<typeof canvasPointFromEvent>;

function findNodeAtPoint(nodes: readonly SimNode[], point: CanvasPoint) {
  let closestNode: SimNode | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (typeof node.x !== "number" || typeof node.y !== "number") {
      continue;
    }

    const distance = Math.hypot(point.x - node.x, point.y - node.y);
    const hitRadius = node.radius + 7;

    if (distance <= hitRadius && distance < closestDistance) {
      closestNode = node;
      closestDistance = distance;
    }
  }

  return closestNode;
}

function paintBackground(context: CanvasRenderingContext2D, canvasSize: CanvasSize, isDarkMode: boolean) {
  const palette = graphPalette(isDarkMode);

  context.clearRect(0, 0, canvasSize.width, canvasSize.height);
  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, canvasSize.width, canvasSize.height);
}

function paintEmptyGraph(context: CanvasRenderingContext2D, canvasSize: CanvasSize, isDarkMode: boolean) {
  const palette = graphPalette(isDarkMode);
  const centerX = canvasSize.width / 2;
  const centerY = canvasSize.height / 2;

  context.strokeStyle = palette.emptyStroke;
  context.lineWidth = 1.25;
  context.beginPath();
  context.arc(centerX, centerY, 52, 0, Math.PI * 2);
  context.moveTo(centerX - 70, centerY);
  context.lineTo(centerX + 70, centerY);
  context.moveTo(centerX, centerY - 70);
  context.lineTo(centerX, centerY + 70);
  context.stroke();
}

function paintLinks(context: CanvasRenderingContext2D, links: readonly SimLink[], isDarkMode: boolean) {
  const palette = graphPalette(isDarkMode);

  for (const link of links) {
    const source = linkEndpointNode(link.source);
    const target = linkEndpointNode(link.target);

    if (!source || !target || typeof source.x !== "number" || typeof source.y !== "number" || typeof target.x !== "number" || typeof target.y !== "number") {
      continue;
    }

    context.save();
    context.globalAlpha = 0.16 + link.confidence * 0.58;
    context.strokeStyle = palette.link;
    context.lineWidth = 0.75 + link.weight * 3.25;
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.stroke();
    context.restore();
  }
}

function paintNodes(context: CanvasRenderingContext2D, nodes: readonly SimNode[], hoveredNodeId: string | undefined, isDarkMode: boolean) {
  const palette = graphPalette(isDarkMode);

  for (const node of nodes) {
    if (typeof node.x !== "number" || typeof node.y !== "number") {
      continue;
    }

    const isHovered = node.id === hoveredNodeId;
    const isPeople = node.source === "people_daily";
    const opacity = isHovered ? 1 : node.matchState === "matched" ? 0.9 : 0.52;

    if (isHovered) {
      context.save();
      context.globalAlpha = 0.22;
      context.fillStyle = isPeople ? palette.people : palette.pla;
      context.beginPath();
      context.arc(node.x, node.y, node.radius + 9, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    context.save();
    context.globalAlpha = opacity;
    context.fillStyle = isPeople ? palette.people : palette.pla;
    context.strokeStyle = palette.nodeStroke;
    context.lineWidth = isHovered ? 2.5 : 1.5;
    context.beginPath();
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (node.matchState === "isolated") {
      context.strokeStyle = palette.isolatedRing;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(node.x, node.y, node.radius + 3.5, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
  }
}

function keepNodeInCanvas(node: SimNode, canvasSize: CanvasSize) {
  if (typeof node.x !== "number" || typeof node.y !== "number") {
    return;
  }

  const padding = node.radius + 10;
  node.x = clamp(node.x, padding, canvasSize.width - padding);
  node.y = clamp(node.y, padding, canvasSize.height - padding);
}

function linkEndpointNode(endpoint: string | number | SimNode | undefined) {
  return typeof endpoint === "object" && endpoint !== null ? endpoint : null;
}

function graphPalette(isDarkMode: boolean) {
  if (isDarkMode) {
    return {
      canvas: "#0f1417",
      people: "#fb7185",
      pla: "#2dd4bf",
      link: "#d6d3d1",
      nodeStroke: "#0f1417",
      isolatedRing: "rgba(231, 236, 235, 0.35)",
      emptyStroke: "rgba(231, 236, 235, 0.25)",
    };
  }

  return {
    canvas: "#fbfaf8",
    people: "#be123c",
    pla: "#0f766e",
    link: "#57534e",
    nodeStroke: "#ffffff",
    isolatedRing: "rgba(87, 83, 78, 0.35)",
    emptyStroke: "rgba(87, 83, 78, 0.25)",
  };
}

function normalizeMetric(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.45;
  }

  if (value >= 1) {
    return clamp(Math.log2(value + 1) / 4, 0.1, 1);
  }

  return clamp(value, 0.08, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function seededJitter(seed: string, span: number) {
  return (seededUnit(seed) * 2 - 1) * span;
}

function seededUnit(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }

  return hash / 9973;
}

function formatIssueDate(date: string) {
  return date.replaceAll("-", ".");
}

function formatPercent(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function viewLabel(value: string) {
  if (value === "matched") {
    return "MACHED only";
  }

  if (value === "only") {
    return "Only groups";
  }

  return "All";
}
