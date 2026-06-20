/**
 * Progress-overlay presentation: the modal shown while a download runs.
 *
 * These helpers touch only the DOM and their arguments. The download lifecycle
 * itself — state mutation, saving the file, success/error notifications — stays
 * in the orchestration layer, so this module has no application-state coupling.
 */

/** Show the overlay and reset its readout for a run of `totalTiles` tiles. */
export function showProgressOverlay(totalTiles: number): void {
  const overlay = document.getElementById('progress-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }

  // Reset progress display
  updateProgressDisplay({
    current: 0,
    total: totalTiles,
    percent: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    speed: 0,
    timeElapsed: 0,
    timeRemaining: 0,
  });
}

/** Hide the overlay. */
export function hideProgressOverlay(): void {
  const overlay = document.getElementById('progress-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/** Update the overlay's counters, bar, speed, and ETA from a progress payload. */
export function updateProgressDisplay(progress: any): void {
  // Update progress text
  const currentElement = document.getElementById('progress-current');
  const totalElement = document.getElementById('progress-total');
  if (currentElement && totalElement) {
    currentElement.textContent = progress.current.toString();
    totalElement.textContent = progress.total.toString();
  }

  // Update progress bar
  const progressBar = document.querySelector('.progress-fill') as HTMLElement;
  if (progressBar) {
    progressBar.style.width = `${progress.percent}%`;
  }

  // Update speed
  const speedElement = document.getElementById('download-speed');
  if (speedElement) {
    const speedMBps = (progress.speed / (1024 * 1024)).toFixed(1);
    speedElement.textContent = `${speedMBps} MB/s`;
  }

  // Update time remaining
  const timeElement = document.getElementById('time-remaining');
  if (timeElement) {
    if (progress.timeRemaining > 0) {
      const seconds = Math.floor(progress.timeRemaining / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      timeElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      timeElement.textContent = '--:--';
    }
  }
}
