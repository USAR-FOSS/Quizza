import { describe, it, expect } from "vitest";
import {
  PORTABLE_QUIZ_SCHEMA_VERSION,
  validatePortableQuiz,
  exportToPortableQuiz,
  type PortableQuiz
} from "./portable-quiz";

describe("Portable Quiz Schema & Portability Engine (Issues #80, #81)", () => {
  const validQuiz: PortableQuiz = {
    schemaVersion: PORTABLE_QUIZ_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    generator: "Quizza-Engine",
    quiz: {
      title: "General Science Championship",
      description: "A test covering physics, chemistry, and biology.",
      settings: {
        speedBonus: true,
        powerups: true,
        powerupUses: 2,
        powerupTypes: ["double", "shield"],
        shuffleOptions: true,
        revealAnswers: "per_question",
        leaderboard: "at_end",
        participation: "one_per_device"
      },
      questions: [
        {
          position: 0,
          type: "multiple_choice",
          prompt: "What is the speed of light in vacuum?",
          mediaUrl: "https://images.unsplash.com/photo-light",
          timeLimitSec: 30,
          points: 1000,
          settings: {},
          options: [
            { position: 0, label: "299,792,458 m/s", isCorrect: true, color: "#22c55e" },
            { position: 1, label: "150,000,000 m/s", isCorrect: false, color: "#ef4444" },
            { position: 2, label: "3,000,000 m/s", isCorrect: false, color: "#3b82f6" }
          ]
        },
        {
          position: 1,
          type: "true_false",
          prompt: "Water expands when it freezes.",
          mediaUrl: null,
          timeLimitSec: 15,
          points: 500,
          settings: {},
          options: [
            { position: 0, label: "True", isCorrect: true, color: null },
            { position: 1, label: "False", isCorrect: false, color: null }
          ]
        },
        {
          position: 2,
          type: "scale",
          prompt: "Rate your confidence in thermodynamic laws.",
          mediaUrl: null,
          timeLimitSec: 20,
          points: 0,
          settings: {
            scaleMin: 1,
            scaleMax: 10,
            scaleMinLabel: "Low",
            scaleMaxLabel: "Expert"
          },
          options: []
        }
      ]
    }
  };

  it("validates a fully compliant portable quiz definition", () => {
    const result = validatePortableQuiz(validQuiz);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toBeDefined();
    expect(result.summary?.questionCount).toBe(3);
    expect(result.summary?.totalPoints).toBe(1500);
    expect(result.summary?.questionTypes.multiple_choice).toBe(1);
    expect(result.summary?.questionTypes.true_false).toBe(1);
    expect(result.summary?.questionTypes.scale).toBe(1);
  });

  it("rejects invalid schema version", () => {
    const invalid = { ...validQuiz, schemaVersion: "0.9.0" };
    const result = validatePortableQuiz(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("schemaVersion"))).toBe(true);
  });

  it("rejects multiple choice questions without a correct answer marked", () => {
    const badMC = JSON.parse(JSON.stringify(validQuiz));
    badMC.quiz.questions[0].options[0].isCorrect = false;
    const result = validatePortableQuiz(badMC);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("correct option"))).toBe(true);
  });

  it("rejects scale question where scaleMin >= scaleMax", () => {
    const badScale = JSON.parse(JSON.stringify(validQuiz));
    badScale.quiz.questions[2].settings.scaleMin = 10;
    badScale.quiz.questions[2].settings.scaleMax = 5;
    const result = validatePortableQuiz(badScale);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("scaleMin"))).toBe(true);
  });

  it("safely strips private rosters and internal IDs when exporting", () => {
    const rawQuiz = {
      title: "Private Corporate Trivia",
      description: "Internal competition",
      settings: {
        speedBonus: true,
        teamRoster: [{ teamName: "Alpha", email: "secret@corp.com" }],
        teamEmailVerification: true
      }
    };

    const rawQuestions = [
      {
        position: 0,
        type: "multiple_choice" as const,
        prompt: "Company founding year?",
        mediaUrl: null,
        timeLimitSec: 30,
        points: 1000,
        settings: {},
        options: [
          { position: 0, label: "2020", isCorrect: true, color: null },
          { position: 1, label: "2021", isCorrect: false, color: null }
        ]
      }
    ];

    const exported = exportToPortableQuiz(rawQuiz, rawQuestions);
    expect(exported.schemaVersion).toBe(PORTABLE_QUIZ_SCHEMA_VERSION);
    const settings = exported.quiz.settings as Record<string, unknown>;
    expect(settings.teamRoster).toBeUndefined();
    expect(settings.teamEmailVerification).toBeUndefined();
    expect(exported.quiz.settings.speedBonus).toBe(true);
    expect(exported.quiz.questions[0].options[0].label).toBe("2020");
  });
});
