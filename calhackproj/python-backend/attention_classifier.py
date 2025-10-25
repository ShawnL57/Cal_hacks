"""
Real-time Attention/Attentiveness Classification for Muse 2 EEG
Research-backed approach using Theta/Beta Ratio (NASA Engagement Index)

Primary Metric: Beta / (Beta + Theta)
- High Beta dominant = Focused/Engaged
- Low Theta dominant = Drowsy/Distracted

References:
- PMC8650681: EEG attention metrics review
- Welch's method for spectral power estimation
- Multi-electrode averaging (frontal + temporal)
"""

import numpy as np
from scipy import signal
from scipy.signal import welch
import warnings

warnings.filterwarnings('ignore')


class AttentionClassifier:
    """
    Real-time attention classification using validated Theta/Beta ratio.

    Based on research showing beta/(alpha+theta) and theta/beta ratio
    as primary indicators of engagement and attention capacity.
    """

    def __init__(self, sampling_rate=256):
        self.sampling_rate = sampling_rate
        self.bands = {
            'delta': (0.5, 4),    # Sleep/drowsiness
            'theta': (4, 8),      # Mental effort (primary metric)
            'alpha': (8, 13),     # Cognitive idleness
            'beta': (13, 30),     # Active cognition (primary metric)
            'gamma': (30, 100)    # Higher cognition
        }
        # Baseline for normalization (will be calibrated)
        self.baseline_theta_beta = None
        self.baseline_std = None

    def extract_band_power_welch(self, signal_data):
        """
        Extract band power using Welch's method (more robust than simple filtering).

        Welch's method provides better spectral estimates for short time windows
        by using windowed FFT with averaging.
        """
        if len(signal_data) < 256:
            return {band: 0 for band in self.bands}

        try:
            # Welch's method with 4-second window
            nperseg = int(4 * self.sampling_rate)  # 4 second window
            freqs, psd = welch(signal_data, fs=self.sampling_rate, nperseg=nperseg)

            powers = {}
            for band_name, (low, high) in self.bands.items():
                # Find indices for this band
                mask = (freqs >= low) & (freqs <= high)
                # Integrate PSD in this band
                band_power = np.trapz(psd[mask], freqs[mask]) if np.any(mask) else 0
                powers[band_name] = band_power

            return powers
        except:
            return {band: 0 for band in self.bands}

    def extract_band_power(self, signal_data):
        """
        Extract power in each frequency band using Butterworth filter.
        Falls back to this if Welch fails due to short signal.
        """
        if len(signal_data) < 256:
            return {band: 0 for band in self.bands}

        powers = {}
        for band_name, (low, high) in self.bands.items():
            try:
                sos = signal.butter(4, [low, high], 'band', fs=self.sampling_rate, output='sos')
                filtered = signal.sosfilt(sos, signal_data)
                powers[band_name] = np.sqrt(np.mean(filtered ** 2))
            except:
                powers[band_name] = 0

        return powers

    def calculate_focus_score(self, eeg_data):
        """
        Calculate attentiveness/focus score using research-backed metrics:

        PRIMARY: Theta/Beta Ratio (Engagement index)
        - High beta relative to theta = engaged/focused
        - High theta relative to beta = drowsy/disengaged

        SECONDARY: Alpha suppression (Cognitive idleness)
        - Low alpha = active attention
        - High alpha = cognitive idleness

        Returns: focus_score (0=drowsy, 1=highly focused), beta_theta_ratio
        """
        if len(eeg_data) < 256:
            return 0.5, 0

        try:
            powers = self.extract_band_power(np.array(eeg_data))
            theta = powers['theta']
            beta = powers['beta']
            alpha = powers['alpha']
            delta = powers['delta']

            # PRIMARY METRIC: Theta/Beta Ratio (Engagement Index)
            # High beta, low theta = focused
            # High theta, low beta = drowsy
            if theta + beta > 0:
                theta_beta_ratio = theta / (theta + beta + 0.001)  # Ratio in [0,1]
                # Invert: high ratio (high theta) -> low focus
                beta_engagement = 1.0 - theta_beta_ratio
            else:
                beta_engagement = 0.5

            # SECONDARY METRIC: Alpha suppression (inverse of cognitive idleness)
            # High alpha = cognitive idleness (lower attentiveness)
            # Normalize alpha power
            total_power = theta + alpha + beta + delta + 0.001
            alpha_ratio = alpha / total_power  # Proportion of alpha
            alpha_suppression = 1.0 - (alpha_ratio * 1.5)  # Penalize high alpha
            alpha_suppression = min(1.0, max(0.0, alpha_suppression))

            # COMBINED SCORE: Weight theta/beta higher (primary), alpha suppression secondary
            focus_score = (beta_engagement * 0.7) + (alpha_suppression * 0.3)
            focus_score = min(1.0, max(0.0, focus_score))

            return focus_score, beta / (theta + 0.001)
        except:
            return 0.5, 0

    def calculate_theta_power(self, eeg_data):
        """Higher theta = drowsiness/distraction"""
        if len(eeg_data) < 256:
            return 0
        try:
            powers = self.extract_band_power(np.array(eeg_data))
            return powers['theta']
        except:
            return 0

    def calculate_gamma_power(self, eeg_data):
        """Higher gamma = cognitive engagement"""
        if len(eeg_data) < 256:
            return 0
        try:
            powers = self.extract_band_power(np.array(eeg_data))
            return powers['gamma']
        except:
            return 0

    def calculate_frontal_theta_beta(self, af7, af8):
        """
        Calculate frontal theta/beta ratio (primary attention metric).
        Frontal regions (AF7, AF8) most relevant for attention per PMC8650681.

        Returns: frontal_attention_score based on frontal theta/beta
        """
        if len(af7) < 256 or len(af8) < 256:
            return 0.5

        try:
            frontal_combined = np.concatenate([np.array(af7)[-256:], np.array(af8)[-256:]])
            powers = self.extract_band_power(frontal_combined)

            theta = powers['theta']
            beta = powers['beta']

            if theta + beta > 0:
                theta_beta_ratio = theta / (theta + beta)
                frontal_score = 1.0 - theta_beta_ratio  # Invert: high theta = low focus
            else:
                frontal_score = 0.5

            return min(1.0, max(0.0, frontal_score))
        except:
            return 0.5

    def detect_eye_blink_artifacts(self, frontal_data):
        """
        Detect eye blink artifacts in frontal channels.
        Blinks increase eye movement artifacts, can affect attention assessment.
        """
        if len(frontal_data) < 256:
            return 0

        try:
            data = np.array(frontal_data)[-256:]
            # Look for sharp peaks (EOG artifacts from blinks)
            sos = signal.butter(4, [1, 5], 'band', fs=self.sampling_rate, output='sos')
            filtered = signal.sosfilt(sos, data)

            # Count peaks above threshold
            threshold = np.std(filtered) * 3
            peaks = np.sum(np.abs(filtered) > threshold)
            blink_count = peaks // 20  # Estimate blinks

            return min(1.0, blink_count / 10)
        except:
            return 0

    def classify_attention(self, tp9, af7, af8, tp10):
        """
        Research-backed attention classification using PRIMARY metric:

        THETA/BETA RATIO (Engagement Index)
        Primary research finding: Most reliable single indicator of attention

        - High Beta dominant (0.8+) = Highly Focused/Engaged
        - Balanced Beta-Theta (0.5-0.8) = Normal/Neutral
        - Theta dominant (0.2-0.5) = Distracted/Drowsy
        - Very High Theta (0-0.2) = Severe Drowsiness

        Returns: attention_label, focus_score, distraction_score, confidence
        """
        if not all([len(d) >= 100 for d in [tp9, af7, af8, tp10]]):
            return "unknown", 0.5, 0.5, 0

        try:
            tp9_arr = np.array(list(tp9))[-256:]
            af7_arr = np.array(list(af7))[-256:]
            af8_arr = np.array(list(af8))[-256:]
            tp10_arr = np.array(list(tp10))[-256:]

            # MULTI-ELECTRODE APPROACH (per research): Average frontal + temporal
            # Frontal (AF7, AF8) most attention-specific
            # Temporal (TP9, TP10) for stability
            all_channels = np.concatenate([af7_arr, af8_arr, tp9_arr, tp10_arr])

            # Use Butterworth filter (more stable for real-time with short windows)
            powers = self.extract_band_power(all_channels)

            theta = powers['theta']
            beta = powers['beta']

            # NASA ENGAGEMENT INDEX: Beta / (Beta + Theta)
            # This is the most validated metric in literature
            if theta + beta > 0:
                focus_score = beta / (theta + beta)
            else:
                focus_score = 0.5

            focus_score = min(1.0, max(0.0, focus_score))
            distraction_score = 1.0 - focus_score

            # CLASSIFY based on personalized baseline (if calibrated) or absolute thresholds
            if self.baseline_theta_beta is not None:
                # Use personalized baseline (after calibration)
                deviation = focus_score - self.baseline_theta_beta

                if deviation > 0.15:
                    attention_label = "focused"
                elif deviation > 0.05:
                    attention_label = "neutral"
                elif deviation > -0.10:
                    attention_label = "distracted"
                else:
                    attention_label = "drowsy"
            else:
                # Use absolute thresholds (generic, less accurate)
                if focus_score >= 0.75:
                    attention_label = "focused"
                elif focus_score >= 0.55:
                    attention_label = "neutral"
                elif focus_score >= 0.35:
                    attention_label = "distracted"
                else:
                    attention_label = "drowsy"

            # CONFIDENCE: Based on signal power consistency
            all_data = np.concatenate([tp9_arr, af7_arr, af8_arr, tp10_arr])
            powers_all = [
                self.extract_band_power(tp9_arr),
                self.extract_band_power(af7_arr),
                self.extract_band_power(af8_arr),
                self.extract_band_power(tp10_arr)
            ]

            # Confidence from power consistency across channels
            beta_powers = [p['beta'] for p in powers_all]
            beta_mean = np.mean(beta_powers) if beta_powers else 0
            beta_std = np.std(beta_powers) if beta_powers else 0

            # CV (coefficient of variation): std/mean
            if beta_mean > 0:
                cv = beta_std / beta_mean
                confidence = max(0.3, 1.0 - cv)  # Lower CV = higher confidence
            else:
                confidence = 0.3

            return attention_label, focus_score, distraction_score, confidence

        except Exception as e:
            print(f"Attention classification error: {e}")
            return "unknown", 0.5, 0.5, 0

    def get_focus_color(self, focus_score):
        """Return color based on focus score"""
        if focus_score > 0.7:
            return "#00FF00"  # Green - highly focused
        elif focus_score > 0.55:
            return "#FFFF00"  # Yellow - moderate focus
        elif focus_score > 0.4:
            return "#FFA500"  # Orange - distracted
        else:
            return "#FF0000"  # Red - drowsy/very distracted

    def get_attention_label_color(self, label):
        """Return color for attention state label"""
        colors = {
            "focused": "#00FF00",
            "neutral": "#FFFF00",
            "distracted": "#FFA500",
            "drowsy": "#FF0000",
            "unknown": "#808080"
        }
        return colors.get(label, "#808080")
