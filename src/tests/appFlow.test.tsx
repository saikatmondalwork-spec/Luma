import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '@/src/App';
import { wipeAllLocalData } from '@/src/services/storageService';

describe('Luma end-to-end UI flows', () => {
  beforeEach(async () => {
    await wipeAllLocalData();
    document.documentElement.classList.remove('dark');
  });

  it('completes onboarding, navigates all pages, logs a daily check-in, and switches theme', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Calm, private cycle tracking')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText('Personalize your tracking')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /skip & finish/i }));

    // Redesigned Bento Dashboard renders
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Cycle Rhythm')).toBeInTheDocument();
      expect(screen.getByText('Daily Check-in')).toBeInTheDocument();
    });

    // Toggle Overview wave mode and Right Panel tab
    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Periods' }));

    // Navigate to Calendar
    fireEvent.click(screen.getAllByRole('button', { name: /calendar/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Cycle Calendar')).toBeInTheDocument();
    });

    // Navigate to Insights
    fireEvent.click(screen.getAllByRole('button', { name: /insights/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Cycle Insights/i)).toBeInTheDocument();
    });

    // Navigate to Journal & log entry
    fireEvent.click(screen.getAllByRole('button', { name: /journal/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Health Journal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/private journal note/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/private journal note/i), {
      target: { value: 'Feeling rested and calm today.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save check-in/i }));

    await waitFor(() => {
      expect(screen.getByText('Feeling rested and calm today.')).toBeInTheDocument();
    });

    // Navigate to Settings and switch theme to dark
    fireEvent.click(screen.getAllByRole('button', { name: /settings/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Settings & Privacy/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /evening dark/i }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
