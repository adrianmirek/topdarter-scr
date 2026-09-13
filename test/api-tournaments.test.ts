/**
 * Unit tests for Nakka tournament list mapping and history-date rules.
 */

import {
  isTournamentListPayload,
  parseTournamentDateFromHistoryStartTime,
  shouldKeepCompletedTournament,
  toTournamentDto,
  type NakkaApiTournamentListItem,
} from "../lib/nakka-api-tournaments";
import { NAKKA_BASE_URL } from "../lib/constants";

const sampleCompleted: NakkaApiTournamentListItem = {
  tdid: "t_ZA3r_2927",
  createTime: 1788769922,
  title: "23. turniej DART:START (śr. <45) w Poznań Darts Club",
  t_date: 1789221600,
  status: 40,
  s: 88794,
  d: 6643,
};

const poznanSample: NakkaApiTournamentListItem[] = [
  sampleCompleted,
  {
    tdid: "t_YGZ2_9813",
    createTime: 1782729669,
    title: "Rankingowy Piątek #12 w Poznań Darts Club",
    t_date: 1789146000,
    status: 40,
    s: 449844,
    d: 27208,
  },
  {
    tdid: "t_V4XY_4000",
    createTime: 1787389105,
    title: "EDS1 - Elite Darts Series @ Poznań Darts Club",
    t_date: 1787394600,
    status: 40,
    s: 93916,
    d: 3669,
  },
];

describe("isTournamentListPayload", () => {
  test("should accept an array", () => {
    expect(isTournamentListPayload(poznanSample)).toBe(true);
    expect(isTournamentListPayload([])).toBe(true);
  });

  test("should reject the -50 error body", () => {
    expect(isTournamentListPayload(-50)).toBe(false);
    expect(isTournamentListPayload("-50")).toBe(false);
  });

  test("should reject objects and null", () => {
    expect(isTournamentListPayload(null)).toBe(false);
    expect(isTournamentListPayload({ tdid: "t_ZA3r_2927" })).toBe(false);
  });
});

describe("parseTournamentDateFromHistoryStartTime", () => {
  test("should return null for missing or non-positive startTime", () => {
    expect(parseTournamentDateFromHistoryStartTime(0)).toBeNull();
    expect(parseTournamentDateFromHistoryStartTime(-1)).toBeNull();
  });

  test("should subtract 4 hours and strip time to UTC midnight", () => {
    const startTime = 1787394600;
    const result = parseTournamentDateFromHistoryStartTime(startTime);
    const expectedLocal = new Date(startTime * 1000);
    expectedLocal.setHours(expectedLocal.getHours() - 4);
    const expected = new Date(
      Date.UTC(
        expectedLocal.getFullYear(),
        expectedLocal.getMonth(),
        expectedLocal.getDate(),
        0,
        0,
        0,
        0
      )
    );

    expect(result).not.toBeNull();
    expect(result?.toISOString()).toBe(expected.toISOString());
    expect(result?.getUTCHours()).toBe(0);
    expect(result?.getUTCMinutes()).toBe(0);
    expect(result?.getUTCSeconds()).toBe(0);
  });
});

describe("toTournamentDto", () => {
  test("should map tdid, title, href, history date, and completed status", () => {
    const parsedDate = new Date(Date.UTC(2026, 7, 20, 0, 0, 0, 0));
    const dto = toTournamentDto(sampleCompleted, parsedDate);

    expect(dto.nakka_identifier).toBe("t_ZA3r_2927");
    expect(dto.tournament_name).toBe(
      "23. turniej DART:START (śr. <45) w Poznań Darts Club"
    );
    expect(dto.href).toBe(`${NAKKA_BASE_URL}/comp.php?id=t_ZA3r_2927`);
    expect(dto.tournament_date).toBe(parsedDate);
    expect(dto.status).toBe("completed");
  });

  test("should fall back to Unknown Tournament when title is missing", () => {
    const parsedDate = new Date(Date.UTC(2026, 7, 20, 0, 0, 0, 0));
    const dto = toTournamentDto(
      { ...sampleCompleted, title: "" },
      parsedDate
    );

    expect(dto.tournament_name).toBe("Unknown Tournament");
  });
});

describe("shouldKeepCompletedTournament", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  test("should keep a completed tournament inside the last 6 months", () => {
    const parsedDate = new Date("2026-08-20T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(sampleCompleted, parsedDate, now, sixMonthsAgo)
    ).toBe(true);
  });

  test("should drop status other than 40", () => {
    const parsedDate = new Date("2026-08-20T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        { ...sampleCompleted, status: 30 },
        parsedDate,
        now,
        sixMonthsAgo
      )
    ).toBe(false);
  });

  test("should drop missing tdid", () => {
    const parsedDate = new Date("2026-08-20T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        { ...sampleCompleted, tdid: "" },
        parsedDate,
        now,
        sixMonthsAgo
      )
    ).toBe(false);
  });

  test("should drop a missing history date", () => {
    expect(
      shouldKeepCompletedTournament(sampleCompleted, null, now, sixMonthsAgo)
    ).toBe(false);
  });

  test("should drop a future history date", () => {
    const parsedDate = new Date("2026-10-01T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(sampleCompleted, parsedDate, now, sixMonthsAgo)
    ).toBe(false);
  });

  test("should drop a date older than 6 months", () => {
    const parsedDate = new Date("2026-02-01T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(sampleCompleted, parsedDate, now, sixMonthsAgo)
    ).toBe(false);
  });
});
