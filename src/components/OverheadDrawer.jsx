import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import OverheadPanel from './OverheadPanel.jsx';
import { overheadDrawerGesture } from '../utils/overheadDrawerGesture.js';
import './OverheadDrawer.css';

export default function OverheadDrawer({ open, onOpenChange, flightState, onSystemAction, aircraftModel }) {
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef(null);
  const handleRef = useRef(null);
  const dialogRef = useRef(null);
  const gestureRef = useRef(null);
  const suppressClick = useRef(false);
  const close = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const trigger = handleRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      gestureRef.current = null;
      setDragging(false);
      onOpenChange(false);
    };
    window.addEventListener('keydown', escape, true);
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', escape, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else trigger?.focus();
    };
  }, [open, onOpenChange]);

  const start = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { x: event.clientX, y: event.clientY, open };
    suppressClick.current = false;
    setDragging(true);
  };
  const move = event => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const delta = event.clientY - gesture.y;
    if (Math.abs(delta) > 5 || Math.abs(event.clientX - gesture.x) > 5) suppressClick.current = true;
    // Update only a composited transform, without rerendering the aircraft panel
    // for every pointer movement.
    if (sheetRef.current) {
      const height = gesture.height ??= sheetRef.current.getBoundingClientRect().height;
      sheetRef.current.style.transform = gesture.open
        ? `translateY(${Math.max(-height, Math.min(0, delta))}px)`
        : `translateY(${Math.max(-height, Math.min(0, -height + delta))}px)`;
    }
  };
  const finish = (event, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const next = cancelled ? gesture.open : overheadDrawerGesture(gesture.open, event.clientX - gesture.x, event.clientY - gesture.y);
    if (sheetRef.current) sheetRef.current.style.transform = next ? 'translateY(0)' : 'translateY(calc(-100% - 20px))';
    setDragging(false);
    onOpenChange(next);
  };
  const gripProps = {
    onPointerDown: start, onPointerMove: move, onPointerUp: event => finish(event),
    onPointerCancel: event => finish(event, true),
    onLostPointerCapture: event => finish(event, true),
    onClick: () => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      onOpenChange(!open);
    },
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    },
    onKeyUp: event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    },
    'aria-expanded': open,
    'aria-controls': 'overhead-drawer-panel',
  };
  const trapFocus = event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('button, [tabindex="0"], input, select, a[href]')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  return createPortal(<div className={`overhead-drawer ${open ? 'is-open' : ''} ${dragging ? 'is-dragging' : ''}`}>
    <button hidden={open} ref={handleRef} className="overhead-pull-handle" aria-label="Pull down to open overhead panel" {...gripProps}>
      <span className="overhead-grip" />OVERHEAD<span aria-hidden="true">⌄</span>
    </button>
    {(open || dragging) && <>
      <div className="overhead-drawer-backdrop" onClick={close} aria-hidden="true" />
      <div ref={sheetRef} id="overhead-drawer-panel" className="overhead-drawer-sheet" role="dialog" aria-modal={open || undefined}
        aria-label="Overhead panel" tabIndex={-1} onKeyDown={trapFocus}
        style={{ transform: open ? 'translateY(0)' : 'translateY(calc(-100% - 20px))' }}>
        <div ref={dialogRef} tabIndex={-1} className="overhead-drawer-content">
          <OverheadPanel onClose={close} flightState={flightState} onSystemAction={onSystemAction} aircraftModel={aircraftModel} />
          <button className="overhead-push-handle" aria-label="Push up to close overhead panel" {...gripProps}>
            <span className="overhead-grip" />Push up to close · Esc<span aria-hidden="true">⌃</span>
          </button>
        </div>
      </div>
    </>}
  </div>, document.body);
}

OverheadDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  flightState: PropTypes.object,
  onSystemAction: PropTypes.func,
  aircraftModel: PropTypes.string,
};
