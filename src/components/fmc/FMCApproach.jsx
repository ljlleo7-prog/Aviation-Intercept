import useAirportResults from '../../hooks/useAirportResults.js';
import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../contexts/LanguageContext';
import { airportService } from '../../services/airportService.js';
import { getSourcedRunwayNames } from '../../data/visualRunwayCoordinates.js';
import { approachReferenceStatus, isNavFrequency } from '../../utils/approachReference.js';
import '../SettingsPanel.css';

export default function FMCApproach({ flightState, arrival, onActionRequest }) {
  const { tx } = useLanguage();
  const reference = flightState?.approachReference;
  const [airportCode, setAirportCode] = useState(reference?.airportCode || arrival?.icao || arrival?.iata || '');
  const [runway, setRunway] = useState(reference?.runwayName || '');
  const listId = useId();
  const results = useAirportResults(airportCode, 8);
  const airport = airportService.getAirportByCode(airportCode);
  const sourcedNames = getSourcedRunwayNames(airport?.icao || airport?.iata);
  const names = sourcedNames.length ? sourcedNames : airport?.runways?.map(item => item.name) || [airport?.runway];
  const runwayNames = [...new Set(names.filter(Boolean).flatMap(name => name.split(/[/-]/)))];
  const candidate = airport && runway ? airportService.getRunwayGeometry(airport.icao || airport.iata, runway) : null;
  const verified = candidate && candidate.headingSource !== 'designator-estimate'
    && Number.isFinite(candidate.heading) && isNavFrequency(candidate.ilsFrequency);
  const frequency = flightState?.nav1Frequency ?? flightState?.autopilotDebug?.nav1Frequency;

  return <div className="display-settings">
    <section className="settings-section">
      <h4>{tx('APP runway reference')}</h4>
      <p>{tx('Select the approach runway here, then enter its NAV1 frequency on the bottom central console. APP uses only this selected reference.')}</p>
      <label>{tx('Airport (ICAO/IATA)')}
        <input value={airportCode} list={listId} onChange={event => { setAirportCode(event.target.value.trim().toUpperCase()); setRunway(''); }} />
      </label>
      <datalist id={listId}>{results.map(item => <option key={item.icao || item.iata} value={item.icao || item.iata}>{item.name}</option>)}</datalist>
      <label>{tx('Approach runway')}
        <select value={runway} onChange={event => setRunway(event.target.value)}>
          <option value="">{tx('Select a runway')}</option>
          {runwayNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {candidate && <p>{airport.icao || airport.iata} · RWY {candidate.runwayName}<br/>
        {tx('True course')}: {candidate.heading.toFixed(1)}° · NAV1 {candidate.ilsFrequency.toFixed(2)} MHz
      </p>}
      {candidate && !verified && <p role="status">{tx('Verified runway heading required')}</p>}
      <button type="button" disabled={!verified || !onActionRequest} onClick={() => onActionRequest('set-approach-reference', { airportCode: airport.icao || airport.iata, runwayName: runway })}>{tx('Use as APP reference')}</button>
    </section>
    <section className="settings-section" aria-live="polite">
      <h4>{tx('Active APP reference')}</h4>
      {reference && <p>{reference.airportCode} · RWY {reference.runwayName} · {tx('True course')} {reference.heading.toFixed(1)}°<br/>NAV1 {reference.ilsFrequency.toFixed(2)} MHz</p>}
      <p>{tx(approachReferenceStatus(reference, frequency))}</p>
      {reference && <button type="button" onClick={() => onActionRequest?.('set-approach-reference', null)}>{tx('Clear APP reference')}</button>}
    </section>
  </div>;
}

FMCApproach.propTypes = { flightState: PropTypes.object, arrival: PropTypes.object, onActionRequest: PropTypes.func };
