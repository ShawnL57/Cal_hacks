import { useState, useEffect, useRef } from "react";
import "./TypingTest.css";

interface Metrics {
  attention: string;
  focus_score: number;
  brain_state: string;
  theta_beta_ratio: number;
  attention_confidence: number;
}

function TypingTest() {
  const [testText, setTestText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [testRunning, setTestRunning] = useState(false);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [focusScores, setFocusScores] = useState<number[]>([]);
  const [testComplete, setTestComplete] = useState(false);
  const [avgFocus, setAvgFocus] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    fetchTestWords();
  }, []);

  useEffect(() => {
    if (!testRunning || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [testRunning, timeLeft]);

  useEffect(() => {
    if (!testRunning) return;

    const metricsInterval = setInterval(async () => {
      try {
        const response = await fetch("http://localhost:5001/api/metrics");
        const data = await response.json();
        setMetrics(data);
        setFocusScores((prev) => [...prev, data.focus_score]);
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      }
    }, 500);

    return () => clearInterval(metricsInterval);
  }, [testRunning]);

  useEffect(() => {
    if (userInput.length === 0) return;

    const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60;
    const words = userInput.length / 5;
    const calculatedWpm = elapsed > 0 ? Math.round(words / elapsed) : 0;
    setWpm(calculatedWpm);

    let correct = 0;
    for (let i = 0; i < userInput.length; i++) {
      if (userInput[i] === testText[i]) correct++;
    }
    const calculatedAccuracy =
      userInput.length > 0 ? Math.round((correct / userInput.length) * 100) : 100;
    setAccuracy(calculatedAccuracy);
  }, [userInput]);

  async function fetchTestWords() {
    try {
      const response = await fetch("http://localhost:5001/api/typing-words");
      const data = await response.json();
      setTestText(data.words);
    } catch (error) {
      console.error("Failed to fetch test words:", error);
      setTestText("the quick brown fox jumps over the lazy dog");
    }
  }

  function startTest() {
    setTestRunning(true);
    setTimeLeft(60);
    setUserInput("");
    setWpm(0);
    setAccuracy(100);
    setFocusScores([]);
    setTestComplete(false);
    startTimeRef.current = Date.now();
    fetchTestWords();
    inputRef.current?.focus();
  }

  function endTest() {
    setTestRunning(false);
    setTestComplete(true);
    const avg = focusScores.length > 0
      ? focusScores.reduce((a, b) => a + b) / focusScores.length
      : 0;
    setAvgFocus(avg);
  }

  async function useFocusBaseline() {
    try {
      const response = await fetch("http://localhost:5001/api/calibrate-with-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus_score: avgFocus }),
      });
      const data = await response.json();
      alert("Baseline calibrated! " + data.message);
      window.location.href = "/";
    } catch (error) {
      alert("Error setting baseline: " + error);
    }
  }

  function renderTextDisplay() {
    return (
      <div className="text-display">
        {testText.split("").map((char, i) => {
          let className = "";
          if (i < userInput.length) {
            className = userInput[i] === char ? "correct" : "incorrect";
          } else if (i === userInput.length) {
            className = "current";
          }
          return (
            <span key={i} className={className}>
              {char}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="typing-test-container">
      <h1>🧠 Focus Calibration Test</h1>

      <div className="instructions">
        <strong>How it works:</strong> Type the text as fast and accurately as you can.
        Your brain activity will be recorded during this focused task to establish your
        "focused baseline" for attention detection.
      </div>

      {!testComplete ? (
        <div className="test-container">
          {renderTextDisplay()}

          <input
            ref={inputRef}
            type="text"
            className="input-box"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Click here and start typing..."
            disabled={!testRunning}
          />

          <div className="stats">
            <div className="stat">
              <div className="stat-value">{wpm}</div>
              <div className="stat-label">WPM</div>
            </div>
            <div className="stat">
              <div className="stat-value">{accuracy}%</div>
              <div className="stat-label">Accuracy</div>
            </div>
            <div className="stat">
              <div className="stat-value">{timeLeft}s</div>
              <div className="stat-label">Time Left</div>
            </div>
            <div className="stat">
              <div className="stat-value">{testRunning ? "Running" : "Ready"}</div>
              <div className="stat-label">Status</div>
            </div>
          </div>

          {testRunning && metrics && (
            <div className="brain-metrics">
              <div className="metric">
                <span>Focus Level:</span>
                <span className="metric-value">
                  {metrics.attention} ({(metrics.focus_score * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="metric">
                <span>Brain State:</span>
                <span className="metric-value">{metrics.brain_state}</span>
              </div>
              <div className="metric">
                <span>θ/β Ratio:</span>
                <span className="metric-value">{metrics.theta_beta_ratio.toFixed(3)}</span>
              </div>
              <div className="metric">
                <span>Confidence:</span>
                <span className="metric-value">
                  {(metrics.attention_confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          <div className="button-group">
            <button onClick={startTest} disabled={testRunning}>
              Start Test (60 seconds)
            </button>
            <button onClick={() => window.location.href = "/"}>
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="completed">
          <h2>✅ Test Complete!</h2>
          <p>
            Average Focus During Test: {(avgFocus * 100).toFixed(1)}%<br />
            This will be your new focused baseline.
          </p>
          <div className="button-group">
            <button onClick={useFocusBaseline}>Use Measured Focus as Baseline</button>
            <button onClick={() => window.location.reload()}>Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TypingTest;
