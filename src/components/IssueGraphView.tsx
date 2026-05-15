"use client";

import Link from "next/link";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export interface IssueGraphDateMetric {
  issueDate: string;
  nodes: number;
  links: number;
  peopleNodes: number;
  plaNodes: number;
  matchedNodes: number;
  isolatedNodes: number;
}

export interface IssueGraphViewProps {
  graph?: IssueGraphData | null;
  issueDate?: string;
  selectedDate?: string;
  availableDates?: readonly string[];
  dateMetrics?: readonly IssueGraphDateMetric[];
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

const compactCanvasHeight = 460;
const roomyCanvasHeight = 560;

export function IssueGraphView({
  graph,
  issueDate,
  selectedDate,
  availableDates = [],
  dateMetrics = [],
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
  const handleDateSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextDate = event.currentTarget.value;

      if (!nextDate || nextDate === dateNavigation.activeDate) {
        return;
      }

      window.location.assign(dateHref(nextDate, viewFilter, sortMode));
    },
    [dateNavigation.activeDate, sortMode, viewFilter],
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
      const nextHeight = Math.max(420, Math.floor(rect.height || fallbackHeight));

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
          .distance((link) => Math.max(72, 124 - link.confidence * 34 - link.weight * 14))
          .strength((link) => 0.045 + link.confidence * 0.1),
      )
      .force("charge", forceManyBody<SimNode>().strength((node) => (node.matchState === "matched" ? -78 : -46)))
      .force("collision", forceCollide<SimNode>().radius((node) => node.radius + 8).iterations(2))
      .force("x", forceX<SimNode>((node) => node.targetX).strength((node) => (node.matchState === "matched" ? 0.18 : 0.12)))
      .force("y", forceY<SimNode>((node) => node.targetY).strength((node) => (node.matchState === "matched" ? 0.18 : 0.12)))
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
          <nav className="mt-3 grid gap-2 lg:grid-cols-[auto_minmax(230px,320px)_minmax(0,1fr)] lg:items-end" aria-label="Issue graph dates">
            <div className="flex flex-wrap items-center gap-1.5">
              <DateNavLink label="前" date={dateNavigation.previousDate} viewFilter={viewFilter} sortMode={sortMode} />
              <DateNavLink label="次" date={dateNavigation.nextDate} viewFilter={viewFilter} sortMode={sortMode} />
              <DateNavLink label="最新" date={dateNavigation.latestDate} viewFilter={viewFilter} sortMode={sortMode} strong />
            </div>
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Saved issue date
              <select
                defaultValue={dateNavigation.activeDate}
                onChange={handleDateSelectChange}
                className="h-8 w-full rounded-sm border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-teal-400"
              >
                {dateNavigation.optionDates.map((date) => (
                  <option key={date} value={date}>
                    {formatIssueDate(date)}
                  </option>
                ))}
              </select>
            </label>
            <div className="min-w-0 overflow-x-auto pb-0.5">
              <div className="flex w-max items-center gap-1.5">
                <span className="pr-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
                  Nearby
                </span>
                {dateNavigation.nearbyDates.map((date) => (
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
            </div>
          </nav>
        ) : null}
      </header>

      {expanded ? (
        <div className="border-t border-stone-200 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-950">
          <div
            ref={canvasShellRef}
            className="relative h-[460px] min-h-[420px] w-full bg-stone-50 dark:bg-stone-950 md:h-[540px] xl:h-[580px]"
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
          <GraphAnalytics
            metrics={dateMetrics.length > 0 ? dateMetrics : [metricFromSummary(issueDate, summary)]}
            selectedDate={selectedDate ?? issueDate}
          />
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

function GraphAnalytics({
  metrics,
  selectedDate,
}: {
  metrics: readonly IssueGraphDateMetric[];
  selectedDate?: string;
}) {
  const chartMetrics = [...metrics].sort((left, right) => left.issueDate.localeCompare(right.issueDate));
  const selectedMetric =
    chartMetrics.find((metric) => metric.issueDate === selectedDate) ??
    chartMetrics[chartMetrics.length - 1];
  const chartSelectedDate = selectedMetric?.issueDate;
  const dateTickIndices = buildDateTickIndices(chartMetrics, chartSelectedDate);
  const maxValue = niceChartMax(
    Math.max(1, ...chartMetrics.flatMap((metric) => [metric.nodes, metric.links])),
  );
  const chart = {
    width: 920,
    height: 308,
    left: 52,
    right: 32,
    top: 20,
    bottom: 62,
  };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const baselineY = chart.top + plotHeight;
  const bandWidth = plotWidth / Math.max(1, chartMetrics.length);
  const xFor = (index: number) =>
    chart.left + bandWidth * index + bandWidth / 2;
  const yFor = (value: number) =>
    baselineY - (value / maxValue) * plotHeight;
  const heightFor = (value: number) => baselineY - yFor(value);
  const barWidth = Math.min(34, Math.max(14, bandWidth * 0.5));
  const linePath = chartMetrics
    .map((metric, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(metric.links)}`)
    .join(" ");

  return (
    <section className="border-t border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Graph analytics
          </p>
          <h3 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
            日付別のノード数 / エッジ数
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <AnalyticsStat label="selected" value={selectedMetric?.issueDate ?? "-"} />
            <AnalyticsStat label="nodes" value={`${selectedMetric?.nodes ?? 0}`} />
            <AnalyticsStat label="edges" value={`${selectedMetric?.links ?? 0}`} />
            <AnalyticsStat label="People's" value={`${selectedMetric?.peopleNodes ?? 0}`} />
            <AnalyticsStat label="81cn" value={`${selectedMetric?.plaNodes ?? 0}`} />
            <AnalyticsStat label="matched nodes" value={`${selectedMetric?.matchedNodes ?? 0}`} />
          </dl>
        </div>

        <div className="min-w-0 rounded-md border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40">
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-label="日付ごとのノード数を棒、エッジ数を折線で表示"
            className="h-[260px] w-full overflow-visible"
          >
            {[0, 0.5, 1].map((tick) => {
              const y = yFor(maxValue * tick);

              return (
                <g key={tick}>
                  <line
                    x1={chart.left}
                    x2={chart.width - chart.right}
                    y1={y}
                    y2={y}
                    className={cn(
                      tick === 0
                        ? "stroke-stone-300 dark:stroke-stone-700"
                        : "stroke-stone-200 dark:stroke-stone-800",
                    )}
                    strokeDasharray={tick === 0 ? undefined : "4 6"}
                  />
                  <text
                    x={chart.left - 12}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-stone-400 text-[11px] font-semibold dark:fill-stone-500"
                  >
                    {Math.round(maxValue * tick)}
                  </text>
                </g>
              );
            })}
            <line
              x1={chart.left}
              x2={chart.left}
              y1={chart.top}
              y2={baselineY}
              className="stroke-stone-200 dark:stroke-stone-800"
            />

            {chartMetrics.map((metric, index) => {
              const x = xFor(index);
              const isSelected = metric.issueDate === chartSelectedDate;
              const peopleHeight = heightFor(metric.peopleNodes);
              const plaHeight = heightFor(metric.plaNodes);
              const totalHeight = heightFor(metric.nodes);
              const barX = x - barWidth / 2;
              const peopleY = baselineY - peopleHeight;
              const plaY = baselineY - peopleHeight - plaHeight;
              const showDateLabel = dateTickIndices.has(index);

              return (
                <g key={metric.issueDate}>
                  <rect
                    x={barX}
                    y={baselineY - totalHeight}
                    width={barWidth}
                    height={Math.max(1, totalHeight)}
                    rx="4"
                    className="fill-stone-100 dark:fill-stone-800"
                  />
                  <rect
                    x={barX}
                    y={peopleY}
                    width={barWidth}
                    height={Math.max(0, peopleHeight)}
                    className={cn(
                      isSelected
                        ? "fill-rose-500 dark:fill-rose-300"
                        : "fill-rose-300 dark:fill-rose-800",
                    )}
                  />
                  <rect
                    x={barX}
                    y={plaY}
                    width={barWidth}
                    height={Math.max(0, plaHeight)}
                    rx="4"
                    className={cn(
                      isSelected
                        ? "fill-teal-500 dark:fill-teal-300"
                        : "fill-teal-300 dark:fill-teal-800",
                    )}
                  />
                  {isSelected ? (
                    <rect
                      x={barX - 2}
                      y={baselineY - totalHeight - 2}
                      width={barWidth + 4}
                      height={Math.max(1, totalHeight) + 4}
                      rx="6"
                      fill="none"
                      className="stroke-stone-700 dark:stroke-stone-200"
                      strokeWidth="1.5"
                    />
                  ) : null}
                  <line
                    x1={x}
                    x2={x}
                    y1={baselineY + 5}
                    y2={showDateLabel ? baselineY + 12 : baselineY + 8}
                    className={cn(
                      isSelected ? "stroke-teal-700 dark:stroke-teal-300" : "stroke-stone-300 dark:stroke-stone-700",
                    )}
                  />
                  {showDateLabel ? (
                    <text
                      x={x}
                      y={chart.height - 24}
                      textAnchor="middle"
                      className={cn(
                        "fill-stone-500 text-[10px] font-semibold dark:fill-stone-400",
                        isSelected && "fill-teal-800 dark:fill-teal-200",
                      )}
                    >
                      {formatShortDate(metric.issueDate)}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {linePath ? (
              <path
                d={linePath}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                className="stroke-stone-800 dark:stroke-stone-100"
              />
            ) : null}
            {chartMetrics.map((metric, index) => {
              const isSelected = metric.issueDate === chartSelectedDate;
              return (
                <circle
                  key={`${metric.issueDate}-edge-point`}
                  cx={xFor(index)}
                  cy={yFor(metric.links)}
                  r={isSelected ? 5 : 3.5}
                  className={cn(
                    isSelected ? "fill-stone-900 dark:fill-stone-100" : "fill-white dark:fill-stone-950",
                    "stroke-stone-800 dark:stroke-stone-100",
                  )}
                  strokeWidth="2"
                />
              );
            })}
            <title>People&apos;s / 81cn stacked node bars with edge-count line</title>
          </svg>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400 dark:bg-rose-300" />
              People&apos;s nodes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-teal-400 dark:bg-teal-300" />
              81cn nodes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-stone-800 dark:bg-stone-100" />
              edges
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-stone-200 bg-stone-50 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-900/70">
      <dt className="font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-stone-950 dark:text-stone-50">{value}</dd>
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

function metricFromSummary(
  issueDate: string | undefined,
  summary: ReturnType<typeof summarizeGraph>,
): IssueGraphDateMetric {
  return {
    issueDate: issueDate ?? "unknown-date",
    nodes: summary.nodes,
    links: summary.links,
    peopleNodes: summary.peopleNodes,
    plaNodes: summary.plaNodes,
    matchedNodes: summary.matchedNodes,
    isolatedNodes: summary.isolatedNodes,
  };
}

function buildSimulationGraph(graph: IssueGraphData | null | undefined, canvasSize: CanvasSize) {
  const rawNodes = graph?.nodes ?? [];
  const rawLinks = graph?.links ?? [];
  const degreeById = buildDegreeMap(rawNodes, rawLinks);
  const nodeIds = new Set(rawNodes.map((node) => node.id));
  const ringIndexById = buildRingIndex(rawNodes, rawLinks);
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

function buildRingIndex(nodes: readonly IssueGraphNode[], links: readonly IssueGraphLink[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const link of links) {
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) {
      continue;
    }

    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  }

  const visited = new Set<string>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const components: IssueGraphNode[][] = [];

  for (const node of [...nodes].sort((left, right) => nodeDegree(right, adjacency) - nodeDegree(left, adjacency))) {
    if (visited.has(node.id)) {
      continue;
    }

    const queue = [node.id];
    const component: IssueGraphNode[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      const current = nodeId ? nodeById.get(nodeId) : undefined;

      if (!current) {
        continue;
      }

      component.push(current);

      for (const neighborId of adjacency.get(current.id) ?? []) {
        if (visited.has(neighborId)) {
          continue;
        }

        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(sortRingComponent(component, adjacency));
  }

  const orderedNodes = components
    .sort((left, right) => componentRank(left, adjacency) - componentRank(right, adjacency))
    .flat();

  return new Map(
    orderedNodes.map((node, index) => [node.id, index]),
  );
}

function graphRingPoint(index: number, total: number, canvasSize: CanvasSize) {
  const safeTotal = Math.max(1, total);
  const angle = ((index + 0.5) / safeTotal) * Math.PI * 2 - Math.PI / 2;
  const radiusRatio = canvasSize.width < 720 ? 0.2 : 0.22;
  const radius = Math.max(76, Math.min(canvasSize.width, canvasSize.height) * radiusRatio);

  return {
    x: canvasSize.width / 2 + Math.cos(angle) * radius,
    y: canvasSize.height / 2 + Math.sin(angle) * radius,
  };
}

function sortRingComponent(
  component: readonly IssueGraphNode[],
  adjacency: Map<string, Set<string>>,
) {
  const sorted = [...component].sort(
    (left, right) =>
      nodeDegree(right, adjacency) - nodeDegree(left, adjacency) ||
      seededUnit(left.id) - seededUnit(right.id),
  );
  const people = sorted.filter((node) => canonicalSource(node.source) === "people_daily");
  const pla = sorted.filter((node) => canonicalSource(node.source) === "pla_daily");
  const ordered: IssueGraphNode[] = [];
  const maxLength = Math.max(people.length, pla.length);

  for (let index = 0; index < maxLength; index += 1) {
    const first = people.length >= pla.length ? people[index] : pla[index];
    const second = people.length >= pla.length ? pla[index] : people[index];

    if (first) {
      ordered.push(first);
    }

    if (second) {
      ordered.push(second);
    }
  }

  return ordered;
}

function componentRank(
  component: readonly IssueGraphNode[],
  adjacency: Map<string, Set<string>>,
) {
  const connected = component.some((node) => nodeDegree(node, adjacency) > 0) ? 0 : 1;
  const sizeRank = -component.length / 1000;
  const seedRank = seededUnit(component[0]?.id ?? "");

  return connected + sizeRank + seedRank / 100;
}

function nodeDegree(node: IssueGraphNode, adjacency: Map<string, Set<string>>) {
  return adjacency.get(node.id)?.size ?? 0;
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
  const windowRadius = 4;
  const nearbyDates =
    activeIndex >= 0
      ? dates.slice(Math.max(0, activeIndex - windowRadius), Math.min(dates.length, activeIndex + windowRadius + 1))
      : dates.slice(Math.max(0, dates.length - windowRadius * 2 - 1));

  return {
    dates,
    optionDates: [...dates].reverse(),
    activeDate: resolvedActiveDate,
    previousDate: activeIndex > 0 ? dates[activeIndex - 1] : undefined,
    nextDate: activeIndex >= 0 && activeIndex < dates.length - 1 ? dates[activeIndex + 1] : undefined,
    latestDate,
    nearbyDates,
  };
}

function buildDateTickIndices(
  metrics: readonly IssueGraphDateMetric[],
  selectedDate?: string,
) {
  const selectedIndex = metrics.findIndex((metric) => metric.issueDate === selectedDate);
  const count = metrics.length;
  const step = count <= 14 ? 1 : count <= 24 ? 2 : 3;
  const indices = new Set<number>();

  for (let index = 0; index < count; index += 1) {
    const isFirst = index === 0;
    const isLast = index === count - 1;
    const isSelected = index === selectedIndex;
    const isMonthBoundary =
      index > 0 && metrics[index]?.issueDate.slice(0, 7) !== metrics[index - 1]?.issueDate.slice(0, 7);
    const isSteppedTick = index % step === 0;

    if (isFirst || isLast || isSelected || isMonthBoundary || isSteppedTick) {
      indices.add(index);
    }
  }

  if (selectedIndex >= 0 && count > 18) {
    const minimumGap = count > 24 ? 2 : 1;

    for (const index of [...indices]) {
      const protectedTick =
        index === 0 ||
        index === count - 1 ||
        index === selectedIndex ||
        (index > 0 && metrics[index]?.issueDate.slice(0, 7) !== metrics[index - 1]?.issueDate.slice(0, 7));

      if (!protectedTick && Math.abs(index - selectedIndex) <= minimumGap) {
        indices.delete(index);
      }
    }
  }

  return indices;
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

function niceChartMax(value: number) {
  if (value <= 10) {
    return 10;
  }

  if (value <= 25) {
    return Math.ceil(value / 5) * 5;
  }

  if (value <= 120) {
    return Math.ceil(value / 10) * 10;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
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

function formatShortDate(date: string) {
  return date.slice(5).replace("-", "/");
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
