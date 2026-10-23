import { useLanguage } from '../contexts/LanguageContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './TutorialOverlay.css';

const TUTORIAL_STEP_MAP = {
  'flight-basics': [
    {
      id: 'welcome',
      title: 'Welcome Pilot',
      instruction: 'This lesson introduces the core controls you will use most often in the flight deck.',
      action: 'Press Next to begin.',
      condition: () => true,
      highlight: null
    },
    {
      id: 'controls_pitch',
      title: 'Pitch Control',
      instruction: 'Use the flight controls in the main panel and pitch the aircraft nose up into a climb attitude.',
      action: 'Goal: reach 10 degrees nose up pitch.',
      condition: (state) => state.pitch > 10,
      highlight: '.attitude-indicator'
    },
    {
      id: 'controls_roll',
      title: 'Roll Control',
      instruction: 'Bank the aircraft to the right so you can see roll response on the attitude display.',
      action: 'Goal: bank right to 10 degrees.',
      condition: (state) => state.roll > 10,
      highlight: '.attitude-indicator'
    },
    {
      id: 'throttle',
      title: 'Throttle Control',
      instruction: 'Advance the throttle to add thrust and stabilize the aircraft with more energy.',
      action: 'Goal: increase throttle to at least 50%.',
      condition: (state) => state.throttle > 50,
      highlight: '.throttle-lever'
    },
    {
      id: 'autopilot',
      title: 'Autopilot Master',
      instruction: 'Engage the autopilot from the autopilot panel to see how automation holds the aircraft steady.',
      action: 'Goal: engage autopilot.',
      condition: (state) => state.autopilotEngaged === true,
      highlight: '.modern-autopilot-module'
    },
    {
      id: 'complete',
      title: 'Lesson Complete',
      instruction: 'You have completed the basics lesson. Continue flying or return to the main menu.',
      action: 'Press Finish to close the tutorial.',
      condition: () => true,
      highlight: null
    }
  ],
  'autopilot-basics': [
    {
      id: 'welcome',
      title: 'Autopilot Basics',
      instruction: 'This lesson focuses on autopilot engagement and target management.',
      action: 'Press Next to continue.',
      condition: () => true,
      highlight: '.modern-autopilot-module'
    },
    {
      id: 'engage-ap',
      title: 'Engage AP',
      instruction: 'Turn on the autopilot master so the airplane is ready to follow selected targets.',
      action: 'Goal: AP ON.',
      condition: (state) => state.autopilotEngaged === true,
      highlight: '.modern-autopilot-module'
    },
    {
      id: 'change-heading',
      title: 'Heading Target',
      instruction: 'Adjust the heading target to command the aircraft toward a new direction.',
      action: 'Goal: set heading target at least 5° away from current heading.',
      condition: (state) => {
        if (!Number.isFinite(state.heading) || !Number.isFinite(state.targetHeading)) return false;
        const delta = Math.abs((((state.targetHeading - state.heading) % 360) + 540) % 360 - 180);
        return delta >= 5;
      },
      highlight: '.modern-autopilot-module'
    },
    {
      id: 'change-altitude',
      title: 'Altitude Target',
      instruction: 'Set a different altitude target to understand vertical mode preparation.',
      action: 'Goal: change the selected altitude by at least 500 ft.',
      condition: (state) => Math.abs((state.targetAltitude || 0) - (state.altitude || 0)) >= 500,
      highlight: '.modern-autopilot-module'
    },
    {
      id: 'complete',
      title: 'Autopilot Lesson Complete',
      instruction: 'You have practiced AP engagement and basic target control.',
      action: 'Press Finish to close the tutorial.',
      condition: () => true,
      highlight: null
    }
  ],
  'radio-communications': [
    {
      id: 'welcome',
      title: 'Radio Communications',
      instruction: 'This lesson uses the radio stack and ATC panel to practice a basic transmission flow.',
      action: 'Press Next to continue.',
      condition: () => true,
      highlight: null
    },
    {
      id: 'tune-frequency',
      title: 'Tune a Working Frequency',
      instruction: 'Use the communication panel to move away from the default frequency and tune a station you can work with.',
      action: 'Goal: tune away from 121.500.',
      condition: (state) => Number.isFinite(state.currentFrequency) && Math.abs(state.currentFrequency - 121.5) > 0.01,
      highlight: '.communication-module'
    },
    {
      id: 'send-call',
      title: 'Make a Tower Call',
      instruction: 'Use the radio action panel to send a takeoff request on a Tower frequency so the lesson follows a realistic ATC flow.',
      action: 'Goal: transmit a Request Takeoff call while tuned to Tower.',
      condition: (state) => state.lastPilotTransmission?.templateId === 'req_takeoff' && state.lastPilotTransmission?.frequencyType === 'TOWER',
      highlight: null
    },
    {
      id: 'complete',
      title: 'Radio Lesson Complete',
      instruction: 'You have tuned a frequency and sent a radio call.',
      action: 'Press Finish to close the tutorial.',
      condition: () => true,
      highlight: null
    }
  ]
};

const buildInfoSteps = (tutorial, tx) => [
  {
    id: 'overview',
    title: tutorial?.title || 'Tutorial',
    instruction: tutorial?.summary || 'Review the lesson briefing and explore the relevant controls in the cockpit.',
    action: 'Press Next for the lesson briefing.',
    condition: () => true,
    highlight: null
  },
  {
    id: 'briefing',
    title: 'Lesson Briefing',
    instruction: tx('Focus areas: ${topics}. Use the listed panels and instruments during this practice scenario.', { topics: (tutorial?.topics || []).map(topic => tx(topic)).join('、') || tx('Cockpit systems') }),
    action: 'Press Finish when you are ready to continue flying on your own.',
    condition: () => true,
    highlight: null
  }
];

const TutorialOverlay = ({ tutorial, physicsState, radioMessages = [], currentFrequency, frequencyType, onClose }) => {
  const { tx } = useLanguage();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const pendingAdvanceTimeoutRef = useRef(null);

  const tutorialSteps = useMemo(() => {
    if (!tutorial) return [];
    if (tutorial.guidanceMode === 'guided' && TUTORIAL_STEP_MAP[tutorial.id]) {
      return TUTORIAL_STEP_MAP[tutorial.id];
    }
    return buildInfoSteps(tutorial, tx);
  }, [tutorial, tx]);

  const currentStep = tutorialSteps[currentStepIndex];
  const isGuidedMode = tutorial?.guidanceMode === 'guided' && tutorialSteps.length > 0;
  const isAutoAdvanceStep = isGuidedMode && currentStep && currentStep.id !== 'welcome' && currentStep.id !== 'complete';

  const tutorialState = useMemo(() => {
    const pilotMessages = radioMessages.filter((message) => message?.sender && message.sender !== 'System');
    const lastPilotTransmission = [...pilotMessages].reverse().find((message) => message?.templateId || message?.type);

    return {
      pitch: physicsState?.pitch ?? 0,
      roll: physicsState?.roll ?? 0,
      throttle: physicsState?.throttle ?? 0,
      altitude: physicsState?.altitude ?? 0,
      heading: physicsState?.heading ?? 0,
      autopilotEngaged: physicsState?.autopilotEngaged === true,
      targetHeading: physicsState?.autopilotTargets?.heading ?? 0,
      targetAltitude: physicsState?.autopilotTargets?.altitude ?? 0,
      currentFrequency: Number(currentFrequency),
      frequencyType,
      radioTransmissionCount: pilotMessages.length,
      lastPilotTransmission: lastPilotTransmission
        ? {
            templateId: lastPilotTransmission.templateId || null,
            frequencyType: lastPilotTransmission.frequency || null,
            type: lastPilotTransmission.type || null
          }
        : null
    };
  }, [physicsState, currentFrequency, frequencyType, radioMessages]);

  const isConditionMet = useMemo(() => {
    if (!currentStep?.condition) return false;
    return currentStep.condition(tutorialState);
  }, [currentStep, tutorialState]);

  const clearPendingAdvance = useCallback(() => {
    if (pendingAdvanceTimeoutRef.current) {
      clearTimeout(pendingAdvanceTimeoutRef.current);
      pendingAdvanceTimeoutRef.current = null;
    }
  }, []);

  const handleNext = useCallback(() => {
    clearPendingAdvance();
    setCurrentStepIndex((prev) => {
      if (prev < tutorialSteps.length - 1) {
        return prev + 1;
      }

      onClose();
      return prev;
    });
  }, [clearPendingAdvance, onClose, tutorialSteps.length]);

  useEffect(() => {
    setCurrentStepIndex(0);
    setIsMinimized(false);
    clearPendingAdvance();
  }, [tutorial?.id, clearPendingAdvance]);

  useEffect(() => {
    if (!isAutoAdvanceStep || !isConditionMet || pendingAdvanceTimeoutRef.current) {
      return undefined;
    }

    pendingAdvanceTimeoutRef.current = setTimeout(() => {
      pendingAdvanceTimeoutRef.current = null;
      handleNext();
    }, 1000);

    return () => {
      clearPendingAdvance();
    };
  }, [clearPendingAdvance, handleNext, isAutoAdvanceStep, isConditionMet]);

  useEffect(() => () => {
    clearPendingAdvance();
  }, [clearPendingAdvance]);

  if (!tutorial || !currentStep) return null;

  const showWaitingText = isGuidedMode && currentStep.id !== 'welcome' && currentStep.id !== 'complete';
  const isLastStep = currentStepIndex === tutorialSteps.length - 1;

  return (
    <div className={`tutorial-overlay ${isMinimized ? 'minimized' : ''}`}>
      <div className="tutorial-header">
        <div>
          <p className="tutorial-label">{tx(tutorial.title)}</p>
          <h3>{tx(currentStep.title)}</h3>
        </div>
        <div className="tutorial-controls">
          <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? tx("Expand") : tx("Minimize")}>
            {isMinimized ? '▲' : '▼'}
          </button>
          <button onClick={onClose} title={tx("Close Tutorial")}>✕</button>
        </div>
      </div>

      {!isMinimized && (
        <div className="tutorial-content">
          <p className="tutorial-step-count">{tx('Step ${current} / ${total}', { current: currentStepIndex + 1, total: tutorialSteps.length })}</p>
          <p className="tutorial-instruction">{tx(currentStep.instruction)}</p>
          <p className="tutorial-action"><strong>{tx(currentStep.action)}</strong></p>

          {tutorial.topics?.length > 0 && (
            <div className="tutorial-topic-strip">
              {tutorial.topics.map((topic) => (
                <span key={topic}>{tx(topic)}</span>
              ))}
            </div>
          )}

          <div className="tutorial-footer">
            <button
              className="tutorial-next-btn"
              onClick={handleNext}
              disabled={isGuidedMode && !isLastStep && currentStep.id !== 'welcome' && !isConditionMet}
            >
              {isLastStep ? tx("Finish") : tx("Next")}
            </button>
            {showWaitingText && (
              <span className="waiting-text">
                {isConditionMet ? tx("Action complete…") : tx("Waiting for action...")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorialOverlay;
