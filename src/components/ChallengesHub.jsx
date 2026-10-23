import { useLanguage } from '../contexts/LanguageContext';
import React, { useMemo, useState } from 'react';
import { CHALLENGE_CATEGORIES } from '../data/challengeCatalog';
import './TutorialHub.css';

const ChallengesHub = ({ challenges = [], onLaunchChallenge, onBack }) => {
  const { tx } = useLanguage();
  const [activeCategory, setActiveCategory] = useState(CHALLENGE_CATEGORIES[0]?.id || 'landing');

  const visibleChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.category === activeCategory),
    [challenges, activeCategory]
  );

  const activeCategoryMeta = CHALLENGE_CATEGORIES.find((category) => category.id === activeCategory);

  return (
    <div className="tutorial-hub-page menu-world">
      <div className="tutorial-hub-shell">
        <div className="tutorial-hub-header">
          <button className="tutorial-back-btn" onClick={onBack}>{tx("← Back")}</button>
          <div>
            <p className="tutorial-hub-kicker">{tx("Challenge Board")}</p>
            <h1>{tx("Challenges")}</h1>
            <p className="tutorial-hub-subtitle">{tx("Pure fun, no hand-holding. These scenarios lock difficulty high, remove guides, and test systems knowledge or raw gut feel.")}</p>
          </div>
        </div>

        <div className="tutorial-hub-content">
          <aside className="tutorial-category-nav">
            {CHALLENGE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                className={`tutorial-category-btn ${category.id === activeCategory ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.id)}
              >
                <span className="tutorial-category-label">{tx(category.label)}</span>
                <span className="tutorial-category-desc">{tx(category.description)}</span>
              </button>
            ))}
          </aside>

          <section className="tutorial-list-panel">
            <div className="tutorial-list-header">
              <div>
                <h2>{tx(activeCategoryMeta?.label) || tx("Challenges")}</h2>
                <p>{tx(activeCategoryMeta?.description)}</p>
              </div>
              <div className="tutorial-list-badge">{tx('${count} challenges', { count: visibleChallenges.length })}</div>
            </div>

            <div className="tutorial-card-grid">
              {visibleChallenges.map((challenge) => (
                <article key={challenge.id} className="tutorial-card">
                  <div className="tutorial-card-topline">
                    <span className="tutorial-chip">{tx(challenge.difficulty)}</span>
                    <span className="tutorial-chip mode info">{challenge.challengeMode === 'systems' ? tx("Systems") : challenge.challengeMode === 'failures' ? tx("Failure") : tx("Gut Check")}</span>
                  </div>

                  <h3>{tx(challenge.title)}</h3>
                  <p className="tutorial-card-summary">{tx(challenge.summary)}</p>

                  <div className="tutorial-card-meta">
                    <span>{tx(challenge.duration)}</span>
                    <span>{challenge.departureCode} → {challenge.arrivalCode}</span>
                  </div>

                  <div className="tutorial-topic-list">
                    <span className="tutorial-topic-tag">{tx("No Guides")}</span>
                    <span className="tutorial-topic-tag">{tx(challenge.difficulty)}</span>
                    {challenge.launchConfig?.restrictions?.autopilotForbidden && (
                      <span className="tutorial-topic-tag">{tx("No AP")}</span>
                    )}
                    {challenge.launchConfig?.restrictions?.instrumentsOnly && (
                      <span className="tutorial-topic-tag">{tx("Instruments Only")}</span>
                    )}
                  </div>

                  <button className="tutorial-launch-btn" onClick={() => onLaunchChallenge(challenge)}>{tx("Start Challenge")}</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ChallengesHub;
