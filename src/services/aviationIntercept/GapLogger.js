class GapLogger {
    constructor() {
        this.logs = [];
    }

    logGap(failureId, observedEffect, existingCascade) {
        this.logs.push({
            failure_triggered: failureId,
            observed_effect: observedEffect,
            existing_cascade: existingCascade,
            timestamp: new Date().toISOString()
        });
    }

    getLogs() {
        return this.logs;
    }

    clearLogs() {
        this.logs = [];
    }
}

export const gapLogger = new GapLogger();
