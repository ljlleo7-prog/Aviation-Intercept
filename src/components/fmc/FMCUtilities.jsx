import { useLanguage } from '../../contexts/LanguageContext';
import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { UNIT_DEFINITIONS, convertUnit, formatNumber } from '../../services/efb/UnitConversion.js';

const FMCUtilities = () => {
  const { tx } = useLanguage();
  const categories = Object.keys(UNIT_DEFINITIONS);
  const defaultCategory = categories[0];
  const [category, setCategory] = useState(defaultCategory);
  const units = Object.keys(UNIT_DEFINITIONS[category] || {});
  const [fromUnit, setFromUnit] = useState(units[0]);
  const [toUnit, setToUnit] = useState(units[1] || units[0]);
  const [value, setValue] = useState('');
  const [distance, setDistance] = useState('100');
  const [speed, setSpeed] = useState('250');

  const result = useMemo(() => convertUnit(value, fromUnit, toUnit, category), [value, fromUnit, toUnit, category]);
  const timeHours = Number(distance) > 0 && Number(speed) > 0 ? Number(distance) / Number(speed) : null;

  const handleCategoryChange = (nextCategory) => {
    const nextUnits = Object.keys(UNIT_DEFINITIONS[nextCategory] || {});
    setCategory(nextCategory);
    setFromUnit(nextUnits[0]);
    setToUnit(nextUnits[1] || nextUnits[0]);
  };

  return (
    <div className="fmc-page efb-page">
      <h4 className="fmc-page-title">{tx("EFB TOOLS / UNIT CONVERSION")}</h4>

      <div className="fmc-section">
        <div className="fmc-section-header">
          <div>
            <div className="fmc-label">{tx("Unit converter")}</div>
            <div className="fmc-section-subtitle">{tx("Aviation-focused quick conversions.")}</div>
          </div>
        </div>
        <div className="fmc-edit-grid">
          <div className="fmc-input-group">
            <label>{tx("Category")}</label>
            <select value={category} onChange={(event) => handleCategoryChange(event.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="fmc-input-group">
            <label>{tx("Value")}</label>
            <input type="number" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Enter value" />
          </div>
          <div className="fmc-input-group">
            <label>{tx("From")}</label>
            <select value={fromUnit} onChange={(event) => setFromUnit(event.target.value)}>
              {units.map((unit) => <option key={unit} value={unit}>{UNIT_DEFINITIONS[category][unit].label}</option>)}
            </select>
          </div>
          <div className="fmc-input-group">
            <label>{tx("To")}</label>
            <select value={toUnit} onChange={(event) => setToUnit(event.target.value)}>
              {units.map((unit) => <option key={unit} value={unit}>{UNIT_DEFINITIONS[category][unit].label}</option>)}
            </select>
          </div>
        </div>
        <div className="fmc-value large">{result === null ? '—' : `${formatNumber(result, 2)} ${toUnit}`}</div>
      </div>

      <div className="fmc-section">
        <div className="fmc-label">{tx("Time / speed / distance")}</div>
        <div className="fmc-edit-grid">
          <div className="fmc-input-group"><label>{tx("Distance (NM)")}</label><input type="number" value={distance} onChange={(event) => setDistance(event.target.value)} /></div>
          <div className="fmc-input-group"><label>{tx("Ground speed (KT)")}</label><input type="number" value={speed} onChange={(event) => setSpeed(event.target.value)} /></div>
        </div>
        <div className="fmc-route-summary-grid">
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("ETE")}</span><span className="fmc-stat-value">{timeHours === null ? '—' : `${Math.floor(timeHours * 60)} min`}</span></div>
          <div className="fmc-stat-card"><span className="fmc-stat-label">{tx("NM / 10 min")}</span><span className="fmc-stat-value">{Number(speed) > 0 ? formatNumber(Number(speed) / 6, 1) : '—'}</span></div>
        </div>
      </div>
    </div>
  );
};

FMCUtilities.propTypes = {};

export default FMCUtilities;
