"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { format, subDays, eachDayOfInterval, isSameDay, startOfYear, endOfYear, getDay } from "date-fns";
import { Flame, Info, BookOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "./button";

interface ActivityData {
    activity_date: string;
    duration_seconds: number;
    pages_read: number;
}

type FilterRange = 'week' | 'year';

export function ReadingHeatmap() {
    const [data, setData] = useState<ActivityData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterRange>('week');
    const [stats, setStats] = useState({
        currentStreak: 0,
        longestStreak: 0,
        totalSessions: 0
    });

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                // Fetch enough history for the longest view (Year)
                // In a real app we might optimize this query based on filter
                const today = new Date();
                const start = format(subDays(today, 365), 'yyyy-MM-dd');
                const end = format(today, 'yyyy-MM-dd');

                const res = await fetch(`/api/activity/history?start=${start}&end=${end}`);
                if (res.ok) {
                    const history: ActivityData[] = await res.json();
                    setData(history);
                    calculateStats(history);
                }
            } catch (error) {
                console.error("Failed to load history", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, []);

    const calculateStats = (history: ActivityData[]) => {
        // Sort history by date desc
        const sorted = [...history].sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());

        // Total Sessions
        const totalSessions = history.length;

        // Current Streak
        let currentStreak = 0;
        const today = new Date();
        const yesterday = subDays(today, 1);

        // specific check for today/yesterday to start the streak
        // Note: activity_date from API is YYYY-MM-DD
        const todayStr = format(today, 'yyyy-MM-dd');
        const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

        const hasActivityToday = sorted.some(d => d.activity_date === todayStr);
        const hasActivityYesterday = sorted.some(d => d.activity_date === yesterdayStr);

        if (hasActivityToday || hasActivityYesterday) {
            let checkDate = hasActivityToday ? today : yesterday;
            let streak = 0;
            const dateMap = new Set(sorted.map(d => d.activity_date));

            while (true) {
                const dateStr = format(checkDate, 'yyyy-MM-dd');
                if (dateMap.has(dateStr)) {
                    streak++;
                    checkDate = subDays(checkDate, 1);
                } else {
                    break;
                }
            }
            currentStreak = streak;
        }

        // Longest Streak
        let maxStreak = 0;
        let tempStreak = 0;
        const sortedAsc = [...history].sort((a, b) => new Date(a.activity_date).getTime() - new Date(b.activity_date).getTime());

        if (sortedAsc.length > 0) {
            tempStreak = 1;
            maxStreak = 1;
            for (let i = 1; i < sortedAsc.length; i++) {
                const prev = new Date(sortedAsc[i - 1].activity_date);
                const curr = new Date(sortedAsc[i].activity_date);
                const diffTime = Math.abs(curr.getTime() - prev.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    tempStreak = 1;
                }
                if (tempStreak > maxStreak) maxStreak = tempStreak;
            }
        }

        setStats({
            currentStreak,
            longestStreak: maxStreak,
            totalSessions
        });
    };

    // Calculate Grid Config
    const chartConfig = useMemo(() => {
        const today = new Date();
        let start = subDays(today, 365); // Default to year view
        let end = today;

        if (filter === 'week') start = subDays(today, 6); // 7 days inclusive
        if (filter === 'year') {
            start = startOfYear(today);
            end = endOfYear(today);
        }

        const days = eachDayOfInterval({ start, end });
        const activityMap = new Map(data.map(d => [d.activity_date, d.duration_seconds]));

        const processedData = days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const duration = activityMap.get(dateStr) || 0;
            const isFuture = day > today;

            // Intensity: 0=none, 1=1-15m, 2=15-30m, 3=30-60m, 4=60m+
            let intensity = 0;
            if (!isFuture && duration > 0) intensity = 1;
            if (!isFuture && duration > 15 * 60) intensity = 2; // > 15m
            if (!isFuture && duration > 30 * 60) intensity = 3; // > 30m
            if (!isFuture && duration > 60 * 60) intensity = 4; // > 60m

            return {
                date: day,
                dateStr,
                duration,
                intensity,
                isFuture
            };
        });

        return {
            start,
            end,
            data: processedData
        };
    }, [data, filter]);

    if (isLoading) {
        return <div className="h-[300px] w-full bg-card animate-pulse rounded-2xl" />;
    }

    return (
        <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">Reading Momentum</h2>
                    {/* Filter (Desktop) */}
                    <div className="hidden sm:flex bg-secondary/50 rounded-lg p-1 ml-4">
                        {(['week', 'year'] as FilterRange[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filter === f
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                {f === 'week' ? '7D' : '1 Year'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mobile Filter */}
                <select
                    className="sm:hidden bg-secondary/50 rounded-lg p-2 text-sm border-none focus:ring-0"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as FilterRange)}
                >
                    <option value="week">Last 7 Days</option>
                    <option value="year">1 Year</option>
                </select>
            </div>

            {/* Main Content Area */}
            <div className="min-h-[160px] mb-6">
                {stats.totalSessions === 0 ? (
                    <ReadingEmptyState />
                ) : (
                    <>
                        {filter === 'year' ? (
                            <HeatmapGrid data={chartConfig.data} />
                        ) : (
                            <ReadingBarChart data={chartConfig.data} range={filter} />
                        )}
                    </>
                )}
            </div>

            {/* Info & Legend Row */}
            <div className="flex justify-between items-center text-xs text-muted-foreground mb-6">
                <div className="relative group">
                    <button className="hover:text-foreground flex items-center gap-1 transition-colors cursor-help">
                        <Info className="w-3 h-3" />
                        How we count sessions
                    </button>
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-popover text-popover-foreground text-[10px] rounded border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        We count any day where you have logged reading activity. Read every day to build your streak!
                    </div>
                </div>
                {stats.totalSessions > 0 && <IntensityLegend />}
            </div>

            {/* Stats Footer */}
            <div className="flex flex-row items-center justify-between border-t border-border pt-4 px-2">
                <div className="flex-1 text-center group">
                    <p className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">{stats.totalSessions}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total Days Read</p>
                </div>
                <div className="flex-1 text-center flex flex-col items-center group relative border-l border-r border-border/50">
                    <div className="relative mb-1">
                        <span className={`text-xl font-bold transition-all ${stats.currentStreak > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
                            {stats.currentStreak}
                        </span>
                        {stats.currentStreak > 0 && (
                            <Flame className="w-3 h-3 text-orange-500 absolute -top-1 -right-2 fill-orange-500 animate-pulse" />
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Current Streak</p>
                </div>
                <div className="flex-1 text-center group">
                    <p className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">{stats.longestStreak}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Longest Streak</p>
                </div>
            </div>

            {/* Motivational Line */}
            {stats.currentStreak > 0 && (
                <div className="text-center mt-4 text-xs text-muted-foreground">
                    Read <span className="text-foreground font-medium">any amount</span> today to keep your streak alive!
                </div>
            )}
        </div>
    );
}

// --- Subcomponents ---

function ReadingEmptyState() {
    return (
        <div className="w-full h-full min-h-[160px] flex flex-col items-center justify-center text-center bg-secondary/10 rounded-xl border-2 border-dashed border-secondary/30 p-6">
            <BookOpen className="w-8 h-8 text-muted-foreground mb-3 opacity-50" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Log your first session</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">
                Read any amount today to start your streak and unlock the heatmap.
            </p>
            <Link href="/random">
                <Button size="sm" variant="default" className="text-xs h-8">
                    Start Reading
                </Button>
            </Link>
        </div>
    );
}


function ReadingBarChart({ data, range }: { data: { date: Date, dateStr: string, duration: number, intensity: number }[], range: FilterRange }) {
    // Dynamic bar width based on data length
    const maxDuration = Math.max(...data.map(d => d.duration), 60 * 60);

    return (
        <div className="w-full h-[160px] flex items-end justify-between gap-1 px-2 overflow-x-auto">
            {data.map((day) => {
                const heightPercent = Math.min((day.duration / maxDuration) * 100, 100);
                const isToday = isSameDay(day.date, new Date());

                // Label Logic
                let showLabel = false;
                if (range === 'week') showLabel = true;

                // Format Logic
                const label = format(day.date, 'EEE');

                return (
                    <div key={day.dateStr} className="flex-1 min-w-[3px] flex flex-col items-center gap-2 group">
                        <div className="relative w-full bg-secondary/30 rounded-t-sm h-[120px] flex items-end overflow-hidden">
                            <div
                                style={{ height: `${Math.max(heightPercent, 0)}%` }}
                                className={`w-full transition-all duration-500 ease-out ${day.intensity === 0 ? 'bg-transparent' :
                                    day.intensity >= 4 ? 'bg-green-500' :
                                        'bg-green-500/70'
                                    }`}
                            />
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-0 left-0 w-full opacity-0 group-hover:opacity-100 bg-popover/90 text-popover-foreground text-[10px] flex items-center justify-center p-1 transition-opacity z-10 whitespace-nowrap">
                                {Math.round(day.duration / 60)}m
                            </div>
                        </div>
                        <div className="h-4 flex items-center">
                            {showLabel && (
                                <span className={`text-[9px] sm:text-[10px] font-medium whitespace-nowrap ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {label}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}


function HeatmapGrid({ data }: { data: { date: Date, intensity: number, dateStr: string, isFuture?: boolean, duration: number }[] }) {
    const [hoveredDay, setHoveredDay] = useState<{ day: typeof data[0], x: number, y: number } | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Calculate weeks for the grid
    const weeks: any[][] = [];
    let currentWeek: any[] = [];

    if (data.length > 0) {
        // Find day of week of first day (0=Sun, 1=Mon)
        const firstDayOfWeek = getDay(data[0].date);
        for (let i = 0; i < firstDayOfWeek; i++) {
            currentWeek.push(null);
        }
    }

    data.forEach((day) => {
        const dayOfWeek = getDay(day.date);
        if (dayOfWeek === 0 && currentWeek.length > 0) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
        currentWeek.push(day);
    });
    if (currentWeek.length > 0) weeks.push(currentWeek);

    // Pre-calculate month labels
    let lastMonthLabel = '';
    const weekLabels = weeks.map((week) => {
        const firstDay = week.find(d => d);
        if (!firstDay) return null;

        const date = firstDay.date;
        const monthLabel = format(date, 'MMM');

        if (monthLabel !== lastMonthLabel) {
            lastMonthLabel = monthLabel;
            return monthLabel;
        }
        return null;
    });

    const getCellColor = (day: { intensity: number, isFuture?: boolean }) => {
        if (day.isFuture) return "bg-secondary/10"; // lighter for future
        switch (day.intensity) {
            case 0: return "bg-secondary/30";
            case 1: return "bg-green-900/40";
            case 2: return "bg-green-700/60";
            case 3: return "bg-green-600/80";
            case 4: return "bg-green-500";
            default: return "bg-secondary/30";
        }
    };

    return (
        <div className="w-full overflow-x-auto pb-2 relative outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <div className="min-w-max">
                {/* Month Labels Row */}
                <div className="flex gap-[3px] mb-1 ml-8">
                    {weeks.map((week, i) => (
                        <div key={i} className="w-2.5 sm:w-3 text-[9px] text-muted-foreground overflow-visible whitespace-nowrap">
                            {weekLabels[i] || ''}
                        </div>
                    ))}
                </div>

                <div className="flex gap-2">
                    {/* Day Labels Column */}
                    <div className="flex flex-col gap-[3px] pt-[1px]">
                        {/* Rows corresponding to Sun(0) to Sat(6) */}
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3 opacity-0">Sun</div>
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3">Mon</div>
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3 opacity-0">Tue</div>
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3">Wed</div>
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3 opacity-0">Thu</div>
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3">Fri</div>
                        <div className="h-2.5 sm:h-3 text-[9px] text-muted-foreground leading-3 opacity-0">Sat</div>
                    </div>

                    {/* Grid */}
                    <div className="flex gap-[3px]">
                        {weeks.map((week, i) => (
                            <div key={i} className="flex flex-col gap-[3px]">
                                {week.map((day, idx) => {
                                    if (!day) {
                                        return <div key={`pad-${i}-${idx}`} className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] bg-transparent" aria-hidden="true" />;
                                    }

                                    const mins = Math.round(day.duration / 60);
                                    const dateFormatted = format(day.date, 'MMMM d, yyyy');
                                    const label = mins > 0
                                        ? `${mins} minutes read on ${dateFormatted}`
                                        : `No reading recorded on ${dateFormatted}`;

                                    return (
                                        <button
                                            key={day.dateStr}
                                            aria-label={label}
                                            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card ${getCellColor(day)}`}
                                            onMouseEnter={(e) => {
                                                const target = e.currentTarget;
                                                const rect = target.getBoundingClientRect();
                                                const x = rect.left + window.scrollX + (rect.width / 2);
                                                const y = rect.top + window.scrollY;
                                                setHoveredDay({ day, x, y });
                                            }}
                                            onMouseLeave={() => setHoveredDay(null)}
                                            onFocus={(e) => {
                                                const target = e.currentTarget;
                                                const rect = target.getBoundingClientRect();
                                                const x = rect.left + window.scrollX + (rect.width / 2);
                                                const y = rect.top + window.scrollY;
                                                setHoveredDay({ day, x, y });
                                            }}
                                            onBlur={() => setHoveredDay(null)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Floating Tooltip */}
            {isMounted && hoveredDay && createPortal(
                <div
                    className="absolute z-[100] px-3 py-2 bg-popover text-popover-foreground text-xs rounded-md shadow-lg border border-border pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col items-center min-w-[100px]"
                    style={{
                        left: hoveredDay.x,
                        top: hoveredDay.y - 8
                    }}
                >
                    <div className="font-semibold mb-0.5">
                        {Math.round(hoveredDay.day.duration / 60)} minutes read
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {format(hoveredDay.day.date, 'MMM d, yyyy')}
                    </div>
                    {/* Arrow */}
                    <div className="w-2 h-2 bg-popover border-r border-b border-border absolute bottom-0 translate-y-1/2 rotate-45 transform left-1/2 -translate-x-1/2"></div>
                </div>,
                document.body
            )}
        </div>
    );
}

function IntensityLegend() {
    return (
        <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Less</span>
            <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-secondary/30" title="0 mins" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-900/40" title="1-15 mins" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-700/60" title="15-30 mins" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-600/80" title="30-60 mins" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-500" title="60+ mins" />
            </div>
            <span className="hidden sm:inline">More</span>
        </div>
    );
}
