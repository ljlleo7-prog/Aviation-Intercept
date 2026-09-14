import React, { useState, useEffect, useMemo, useRef } from 'react';
import { failureGraphManager } from '../services/aviationIntercept/FailureGraphManager.js';

const FailureDebugPanel = ({ physicsService, onClose }) => {
    const [activeFailures, setActiveFailures] = useState([]);
    const [graphFailures, setGraphFailures] = useState([]);
    const [graphEdges, setGraphEdges] = useState([]);
    const [graphSource, setGraphSource] = useState('');
    const [nodePositions, setNodePositions] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [canvasSize] = useState({ width: 2400, height: 1800 });
    const mapRef = useRef(null);
    const dragStateRef = useRef(null);

    useEffect(() => {
        if (!physicsService || !physicsService.failureSystem) return;
        const interval = setInterval(() => {
            const fs = physicsService.failureSystem;
            if (!fs) return;
            setActiveFailures(Array.from(fs.activeFailures.values()));
        }, 250);
        return () => clearInterval(interval);
    }, [physicsService]);

    useEffect(() => {
        const loadGraph = () => {
            setIsLoading(true);
            const graphView = failureGraphManager.initializeRuntimeGraph();
            setGraphFailures(graphView.failures);
            setGraphEdges(graphView.edges);
            setGraphSource(graphView.source);
            setIsLoading(false);
        };
        loadGraph();
    }, []);

    const failureById = useMemo(() => new Map(graphFailures.map(f => [f.id, f])), [graphFailures]);

    const initialPositions = useMemo(() => {
        const padding = 60;
        const rowGap = 100;
        const systems = Array.from(new Set(graphFailures.map(f => f.system || 'OTHER'))).sort();
        const columnCount = Math.max(1, systems.length);
        const columnWidth = Math.max(280, (canvasSize.width - padding * 2) / columnCount);
        const grouped = systems.reduce((acc, system) => {
            acc[system] = [];
            return acc;
        }, {});
        graphFailures.forEach(failure => {
            const system = failure.system || 'OTHER';
            if (!grouped[system]) grouped[system] = [];
            grouped[system].push(failure);
        });
        Object.values(grouped).forEach(items => {
            items.sort((a, b) => (b.severity || 0) - (a.severity || 0) || String(a.failure_code || a.id).localeCompare(String(b.failure_code || b.id)));
        });
        const positions = {};
        systems.forEach((system, columnIndex) => {
            const items = grouped[system] || [];
            items.forEach((failure, rowIndex) => {
                positions[failure.id] = {
                    x: padding + columnIndex * columnWidth,
                    y: padding + rowIndex * rowGap
                };
            });
        });
        return positions;
    }, [graphFailures, canvasSize.width]);

    useEffect(() => {
        if (graphFailures.length === 0) return;
        setNodePositions(prev => {
            const next = { ...prev };
            Object.entries(initialPositions).forEach(([id, pos]) => {
                if (!next[id]) next[id] = pos;
            });
            return next;
        });
    }, [graphFailures, initialPositions]);

    useEffect(() => {
        const handlePointerMove = (event) => {
            if (!dragStateRef.current || !mapRef.current) return;
            const dragData = dragStateRef.current;

            if (dragData.type === 'pan') {
                const dx = event.clientX - dragData.startX;
                const dy = event.clientY - dragData.startY;
                setPan({ x: dragData.panStartX + dx, y: dragData.panStartY + dy });
            } else if (dragData.type === 'node') {
                const rect = mapRef.current.getBoundingClientRect();
                const x = event.clientX - rect.left - dragData.offsetX - pan.x;
                const y = event.clientY - rect.top - dragData.offsetY - pan.y;
                setNodePositions(prev => ({
                    ...prev,
                    [dragData.id]: { x, y }
                }));
            }
        };

        const handlePointerUp = () => {
            dragStateRef.current = null;
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [pan]);

    const getEdgeDelay = (edge) => {
        if (typeof edge.delay_seconds === 'number') return edge.delay_seconds;
        const target = failureById.get(edge.effect_failure);
        const timeScale = target?.time_scale;
        if (timeScale === 'immediate') return 2;
        if (timeScale === 'fast') return 6;
        if (timeScale === 'medium') return 12;
        if (timeScale === 'slow') return 20;
        if (timeScale === 'very_slow') return 35;
        return 15;
    };

    const delayValues = useMemo(() => {
        const values = graphEdges.map(getEdgeDelay).filter(val => Number.isFinite(val));
        return values.sort((a, b) => a - b);
    }, [graphEdges, failureById]);

    const speedThresholds = useMemo(() => {
        if (delayValues.length === 0) {
            return { fast: 5, mid: 15 };
        }
        const fastIndex = Math.floor(delayValues.length * 0.33);
        const midIndex = Math.floor(delayValues.length * 0.66);
        return {
            fast: delayValues[Math.max(0, fastIndex)],
            mid: delayValues[Math.max(0, midIndex)]
        };
    }, [delayValues]);

    const getSpeedColor = (edge) => {
        const delay = getEdgeDelay(edge);
        if (delay <= speedThresholds.fast) return '#ff4d4d';
        if (delay <= speedThresholds.mid) return '#4ade80';
        return '#4b82f2';
    };

    const handleTrigger = (id) => {
        if (physicsService && physicsService.failureSystem) {
            physicsService.failureSystem.triggerFailure(id);
        }
    };

    const activeFailureIds = useMemo(() => new Set(activeFailures.map((failure) => failure.id)), [activeFailures]);
    const selectedFailure = graphFailures.find((failure) => activeFailureIds.has(failure.id)) || graphFailures[0] || null;

    if (!physicsService || !physicsService.failureSystem) {
        return null;
    }

    const nodeWidth = 168;
    const nodeHeight = 52;

    return (
        <div style={{
            position: 'absolute',
            top: '84px',
            left: '108px',
            right: '20px',
            bottom: '20px',
            background: 'rgba(10, 15, 20, 0.95)',
            color: '#e0e0e0',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            padding: '22px',
            borderRadius: '12px',
            zIndex: 9998,
            border: '1px solid #334455',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 80px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden',
            boxSizing: 'border-box'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
                borderBottom: '1px solid #334455',
                paddingBottom: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '12px',
                        height: '12px',
                        background: activeFailures.length > 0 ? '#ff3333' : '#4ade80',
                        borderRadius: '50%',
                        boxShadow: activeFailures.length > 0 ? '0 0 10px #ff3333' : '0 0 10px #4ade80'
                    }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>FAILURE CASCADE MAP</span>
                        <span style={{ fontSize: '10px', color: '#6b7c90' }}>
                            Nodes: {graphFailures.length} · Links: {graphEdges.length} · Active: {activeFailures.length}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px', color: '#99a7b6' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '16px', height: '3px', background: '#ff4d4d', display: 'inline-block' }} />
                            FAST
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '16px', height: '3px', background: '#4ade80', display: 'inline-block' }} />
                            MID
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '16px', height: '3px', background: '#4b82f2', display: 'inline-block' }} />
                            SLOW
                        </span>
                        <span style={{ color: '#667788' }}>THICK = HIGH PROB</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#9fb2c5', padding: '4px 8px', border: '1px solid #324658', borderRadius: '999px' }}>
                        SOURCE: {(graphSource || 'runtime').toUpperCase()}
                    </div>
                    <div style={{ fontSize: '11px', color: '#8899aa', display: 'flex', alignItems: 'center' }}>
                        DIFFICULTY: <span style={{ color: '#fff', marginLeft: '6px' }}>{(physicsService.difficulty || 'ROOKIE').toUpperCase()}</span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#667788',
                            cursor: 'pointer',
                            fontSize: '20px'
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', flex: 1, minHeight: 0 }}>
                <div
                    ref={mapRef}
                    onPointerDown={(event) => {
                        if (event.target !== mapRef.current) return;
                        dragStateRef.current = {
                            type: 'pan',
                            startX: event.clientX,
                            startY: event.clientY,
                            panStartX: pan.x,
                            panStartY: pan.y
                        };
                    }}
                    style={{
                        position: 'relative',
                        borderRadius: '10px',
                        border: '1px solid #223344',
                        overflow: 'hidden',
                        background: 'radial-gradient(circle at 20% 20%, rgba(40, 60, 80, 0.25), transparent 45%), linear-gradient(0deg, rgba(20, 28, 36, 0.95), rgba(12, 18, 26, 0.95))',
                        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
                        cursor: dragStateRef.current?.type === 'pan' ? 'grabbing' : 'grab'
                    }}
                >
                    <div style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                        <svg
                            width={canvasSize.width}
                            height={canvasSize.height}
                            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                        >
                            <defs>
                                <marker id="failure-cascade-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#91a4b8" />
                                </marker>
                            </defs>
                            {graphEdges.map(edge => {
                                const fromPos = nodePositions[edge.cause_failure] || initialPositions[edge.cause_failure];
                                const toPos = nodePositions[edge.effect_failure] || initialPositions[edge.effect_failure];
                                if (!fromPos || !toPos) return null;
                                const x1 = fromPos.x + nodeWidth / 2;
                                const y1 = fromPos.y + nodeHeight / 2;
                                const x2 = toPos.x + nodeWidth / 2;
                                const y2 = toPos.y + nodeHeight / 2;
                                const dx = Math.max(80, Math.abs(x2 - x1) / 2);
                                const probability = typeof edge.probability === 'number' ? edge.probability : 0.5;
                                const strokeWidth = 1.5 + probability * 4;
                                const isActiveEdge = activeFailureIds.has(edge.cause_failure) || activeFailureIds.has(edge.effect_failure);
                                const color = getSpeedColor(edge);
                                return (
                                    <path
                                        key={edge.id}
                                        d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                                        stroke={color}
                                        strokeWidth={strokeWidth}
                                        strokeOpacity={isActiveEdge ? 0.95 : 0.45}
                                        fill="none"
                                        markerEnd="url(#failure-cascade-arrow)"
                                    />
                                );
                            })}
                        </svg>

                        {graphFailures.map(failure => {
                            const pos = nodePositions[failure.id] || initialPositions[failure.id] || { x: 0, y: 0 };
                            const isActive = activeFailureIds.has(failure.id);
                            const title = failure.failure_code || failure.id;
                            return (
                                <div
                                    key={failure.id}
                                    onPointerDown={(event) => {
                                        event.stopPropagation();
                                        if (!mapRef.current) return;
                                        const rect = mapRef.current.getBoundingClientRect();
                                        dragStateRef.current = {
                                            type: 'node',
                                            id: failure.id,
                                            offsetX: event.clientX - rect.left - pan.x - pos.x,
                                            offsetY: event.clientY - rect.top - pan.y - pos.y
                                        };
                                    }}
                                    onDoubleClick={() => handleTrigger(failure.id)}
                                    title={failure.description || title}
                                    style={{
                                        position: 'absolute',
                                        left: `${pos.x}px`,
                                        top: `${pos.y}px`,
                                        width: `${nodeWidth}px`,
                                        minHeight: `${nodeHeight}px`,
                                        background: isActive ? 'linear-gradient(135deg, rgba(92, 28, 28, 0.82), rgba(26, 12, 12, 0.86))' : 'rgba(19, 27, 36, 0.72)',
                                        border: isActive ? '1px solid #ff4d4d' : '1px solid rgba(90, 118, 145, 0.65)',
                                        borderRadius: '10px',
                                        padding: '9px 10px',
                                        cursor: 'grab',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        boxShadow: isActive ? '0 0 18px rgba(255, 77, 77, 0.35)' : '0 0 10px rgba(0, 0, 0, 0.25)',
                                        userSelect: 'none',
                                        backdropFilter: 'blur(3px)'
                                    }}
                                >
                                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#eef4fb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {title.toUpperCase()}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '9px', color: '#9fb2c5' }}>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(failure.system || 'OTHER').toUpperCase()}</span>
                                        <span>{(failure.metadata?.time_scale || failure.time_scale || 'unknown').toUpperCase()}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {isLoading && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(8, 12, 16, 0.75)',
                            color: '#cbd5e1',
                            fontSize: '12px',
                            letterSpacing: '1px'
                        }}>
                            LOADING FAILURE GRAPH...
                        </div>
                    )}
                </div>

                <div style={{
                    borderRadius: '10px',
                    border: '1px solid #223344',
                    background: 'rgba(14, 20, 28, 0.94)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    overflow: 'auto'
                }}>
                    <div style={{ fontSize: '11px', color: '#7f93a8' }}>SELECTED FAILURE</div>
                    {selectedFailure ? (
                        <>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fbff' }}>
                                {(selectedFailure.failure_code || selectedFailure.id).toUpperCase()}
                            </div>
                            <div style={{ fontSize: '11px', color: '#9fb2c5', lineHeight: 1.6 }}>
                                {selectedFailure.description || selectedFailure.failure_code || selectedFailure.id}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px', fontSize: '10px', color: '#91a4b8' }}>
                                <span>SYSTEM</span><span>{(selectedFailure.system || 'OTHER').toUpperCase()}</span>
                                <span>SOURCE</span><span>{(selectedFailure.source || 'runtime').toUpperCase()}</span>
                                <span>TIME SCALE</span><span>{(selectedFailure.metadata?.time_scale || selectedFailure.time_scale || 'unknown').toUpperCase()}</span>
                                <span>TRIGGER</span><span>DOUBLE-CLICK NODE</span>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '11px', color: '#7f93a8', marginBottom: '8px' }}>OUTGOING CASCADES</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {graphEdges.filter(edge => edge.cause_failure === selectedFailure.id).slice(0, 8).map(edge => (
                                        <div key={edge.id} style={{ border: '1px solid #233241', borderRadius: '8px', padding: '8px 10px', background: 'rgba(18, 25, 34, 0.8)' }}>
                                            <div style={{ fontSize: '10px', color: '#dbe7f3' }}>{(edge.effect_failure || edge.target_failure_code || '').toUpperCase()}</div>
                                            <div style={{ fontSize: '9px', color: '#89a0b7', marginTop: '4px' }}>
                                                p={(typeof edge.probability === 'number' ? edge.probability : 0.5).toFixed(2)} · delay={getEdgeDelay(edge)}s{edge.cascadeClass ? ` · ${edge.cascadeClass}` : ''}
                                            </div>
                                        </div>
                                    ))}
                                    {graphEdges.filter(edge => edge.cause_failure === selectedFailure.id).length === 0 && (
                                        <div style={{ fontSize: '10px', color: '#71859a' }}>No outgoing cascades.</div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: '11px', color: '#7f93a8' }}>No failures loaded.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FailureDebugPanel;
