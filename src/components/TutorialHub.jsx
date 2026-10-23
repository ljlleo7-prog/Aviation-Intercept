import { useLanguage } from '../contexts/LanguageContext';
import React, { useMemo, useState } from 'react';
import { TUTORIAL_CATEGORIES } from '../data/tutorialCatalog';
import './TutorialHub.css';

const TutorialHub = ({ tutorials = [], onLaunchTutorial, onBack }) => {
  const { tx } = useLanguage();
  const [activeCategory, setActiveCategory] = useState(TUTORIAL_CATEGORIES[0]?.id || 'basics');

  const visibleTutorials = useMemo(
    () => tutorials.filter((tutorial) => tutorial.category === activeCategory),
    [tutorials, activeCategory]
  );

  const activeCategoryMeta = TUTORIAL_CATEGORIES.find((category) => category.id === activeCategory);

  return (
    <div className="tutorial-hub-page menu-world">
      <div className="tutorial-hub-shell">
        <div className="tutorial-hub-header">
          <button className="tutorial-back-btn" onClick={onBack}>{tx("← Back")}</button>
          <div>
            <p className="tutorial-hub-kicker">{tx("Training Center")}</p>
            <h1>{tx("Tutorial Hub")}</h1>
            <p className="tutorial-hub-subtitle">{tx("Launch guided lessons and practice scenarios for radio, autopilot, approaches, systems, and more.")}</p>
          </div>
        </div>

        <div className="tutorial-hub-content">
          <aside className="tutorial-category-nav">
            {TUTORIAL_CATEGORIES.map((category) => (
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
                <h2>{tx(activeCategoryMeta?.label) || tx("Tutorials")}</h2>
                <p>{tx(activeCategoryMeta?.description)}</p>
              </div>
              <div className="tutorial-list-badge">{tx('${count} lessons', { count: visibleTutorials.length })}</div>
            </div>

            <div className="tutorial-card-grid">
              {visibleTutorials.map((tutorial) => (
                <article key={tutorial.id} className="tutorial-card">
                  <div className="tutorial-card-topline">
                    <span className="tutorial-chip">{tx(tutorial.difficulty)}</span>
                    <span className={`tutorial-chip mode ${tutorial.guidanceMode}`}>{tutorial.guidanceMode === 'guided' ? tx("Guided") : tx("Practice")}</span>
                  </div>

                  <h3>{tx(tutorial.title)}</h3>
                  <p className="tutorial-card-summary">{tx(tutorial.summary)}</p>

                  <div className="tutorial-card-meta">
                    <span>{tx(tutorial.duration)}</span>
                    <span>{tutorial.departureCode} → {tutorial.arrivalCode}</span>
                  </div>

                  <div className="tutorial-topic-list">
                    {tutorial.topics.map((topic) => (
                      <span key={topic} className="tutorial-topic-tag">{tx(topic)}</span>
                    ))}
                  </div>

                  {tutorial.available === false && <p className="tutorial-card-summary">{tx(tutorial.unavailableReason)}</p>}
                  <button className="tutorial-launch-btn" disabled={tutorial.available === false} onClick={() => onLaunchTutorial(tutorial)}>{tx(tutorial.available === false ? 'Unavailable' : 'Start Tutorial')}</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TutorialHub;
