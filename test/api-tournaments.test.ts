/**
 * Unit tests for Nakka tournament list mapping and history-date rules.
 */

import {
  is501FromFirstLegFirstPlayer,
  isMatchListHistoryPayload,
  isTournamentListPayload,
  parseTournamentDateFromHistoryStartTime,
  shouldKeepCompletedTournament,
  toTournamentDto,
  toTournamentListDto,
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

describe("isMatchListHistoryPayload", () => {
  test("should accept a documented match list success body", () => {
    expect(
      isMatchListHistoryPayload({
        result: 0,
        list: [
          {
            mid: "B50GiabD_1785353203041",
            tmid: "t_oOwt_9261_t_2_0xP3_qZ7W",
            startTime: 1785353203,
            match_type: "cricket",
          },
        ],
      })
    ).toBe(true);
    expect(isMatchListHistoryPayload({ result: 0, list: [] })).toBe(true);
  });

  test("should reject error bodies and missing list", () => {
    expect(isMatchListHistoryPayload({ result: -50 })).toBe(false);
    expect(isMatchListHistoryPayload({ list: [] })).toBe(false);
    expect(isMatchListHistoryPayload(null)).toBe(false);
    expect(isMatchListHistoryPayload(-50)).toBe(false);
  });
});

describe("isTournamentListPayload", () => {
  test("should accept a documented tournament list success body", () => {
    expect(
      isTournamentListPayload({ result: 0, list: poznanSample })
    ).toBe(true);
    expect(isTournamentListPayload({ result: 0, list: [] })).toBe(true);
  });

  test("should reject error bodies and missing list", () => {
    expect(isTournamentListPayload(-50)).toBe(false);
    expect(isTournamentListPayload("-50")).toBe(false);
    expect(isTournamentListPayload({ result: -50 })).toBe(false);
    expect(isTournamentListPayload({ list: poznanSample })).toBe(false);
  });

  test("should reject a top-level array, objects, and null", () => {
    expect(isTournamentListPayload(poznanSample)).toBe(false);
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

describe("toTournamentListDto", () => {
  test("should map tdid, title, href, and completed status without a date", () => {
    const dto = toTournamentListDto(sampleCompleted);

    expect(dto.nakka_identifier).toBe("t_ZA3r_2927");
    expect(dto.tournament_name).toBe(
      "23. turniej DART:START (śr. <45) w Poznań Darts Club"
    );
    expect(dto.href).toBe(`${NAKKA_BASE_URL}/comp.php?id=t_ZA3r_2927`);
    expect(dto.tournament_date).toBeNull();
    expect(dto.status).toBe("completed");
  });

  test("should fall back to Unknown Tournament when title is missing", () => {
    const dto = toTournamentListDto({ ...sampleCompleted, title: "" });
    expect(dto.tournament_name).toBe("Unknown Tournament");
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

  test("should keep a completed 501 tournament inside the last 6 months", () => {
    const parsedDate = new Date("2026-08-20T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        sampleCompleted,
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(true);
  });

  test("should drop a non-501 tournament even when date and status would keep", () => {
    const parsedDate = new Date("2026-08-20T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        sampleCompleted,
        parsedDate,
        now,
        sixMonthsAgo,
        false
      )
    ).toBe(false);
  });

  test("should drop status other than 40", () => {
    const parsedDate = new Date("2026-08-20T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        { ...sampleCompleted, status: 30 },
        parsedDate,
        now,
        sixMonthsAgo,
        true
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
        sixMonthsAgo,
        true
      )
    ).toBe(false);
  });

  test("should drop a missing history date", () => {
    expect(
      shouldKeepCompletedTournament(sampleCompleted, null, now, sixMonthsAgo, true)
    ).toBe(false);
  });

  test("should drop a future history date", () => {
    const parsedDate = new Date("2026-10-01T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        sampleCompleted,
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(false);
  });

  test("should drop a date older than 6 months", () => {
    const parsedDate = new Date("2026-02-01T00:00:00.000Z");
    expect(
      shouldKeepCompletedTournament(
        sampleCompleted,
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(false);
  });
});

describe("is501FromFirstLegFirstPlayer", () => {
  test("should keep when first dart left is 501", () => {
    expect(
      is501FromFirstLegFirstPlayer({
        legData: [
          {
            playerData: [[{ score: 0, left: 501 }]],
          },
        ],
      })
    ).toBe(true);
  });

  test("should skip when first dart left is 301", () => {
    expect(
      is501FromFirstLegFirstPlayer({
        legData: [
          {
            playerData: [[{ score: 0, left: 301 }]],
          },
        ],
      })
    ).toBe(false);
  });

  test("should skip when first dart left is 701", () => {
    expect(
      is501FromFirstLegFirstPlayer({
        legData: [
          {
            playerData: [[{ score: 0, left: 701 }]],
          },
        ],
      })
    ).toBe(false);
  });

  test("should skip when later legs are 501 but the first dart is not", () => {
    expect(
      is501FromFirstLegFirstPlayer({
        legData: [
          {
            playerData: [[{ score: 0, left: 301 }]],
          },
          {
            playerData: [[{ score: 0, left: 501 }]],
          },
        ],
      })
    ).toBe(false);
  });

  test("should skip missing legData", () => {
    expect(is501FromFirstLegFirstPlayer({})).toBe(false);
    expect(is501FromFirstLegFirstPlayer(null)).toBe(false);
    expect(is501FromFirstLegFirstPlayer(undefined)).toBe(false);
  });

  test("should skip empty playerData or missing first dart", () => {
    expect(
      is501FromFirstLegFirstPlayer({
        legData: [{ playerData: [] }],
      })
    ).toBe(false);
    expect(
      is501FromFirstLegFirstPlayer({
        legData: [{ playerData: [[]] }],
      })
    ).toBe(false);
  });

  test("should accept a history list item with mid", () => {
    const historyList: Array<{ mid?: string; startTime?: number }> = [
      {
        mid: "iFLeTEwI_1789162367448",
        startTime: 1789162367,
      },
    ];

    expect(historyList[0].mid).toBe("iFLeTEwI_1789162367448");
  });
});
