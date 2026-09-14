/**
 * Unit tests for Nakka league list mapping and season-date rules.
 */

import {
  isLeagueListPayload,
  isSeasonListPayload,
  shouldKeepCompletedLeagueEvent,
  toLeagueDto,
  toLeagueEventDto,
  type NakkaApiLeagueListItem,
  type NakkaApiLeagueSeasonItem,
} from "../lib/nakka-api-leagues";
import { NAKKA_LEAGUE_BASE_URL } from "../lib/constants";

const sampleLeague: NakkaApiLeagueListItem = {
  lgid: "lg_mD0F_0939",
  title: "Wtorkowe Granie w Poznań Darts Club (Wrzesień)",
  cnt: 5,
};

const wtorkoweSample: NakkaApiLeagueListItem[] = [
  sampleLeague,
  {
    lgid: "lg_kfRZ_6305",
    title: "Wtorkowe Granie w Poznań Darts Club (Sierpień 2026)",
    cnt: 4,
  },
  {
    lgid: "lg_wJz3_8786",
    title: "Wtorkowe Granie w Poznań Darts Club (Lipiec 26)",
    cnt: 4,
  },
];

const sampleSeason: NakkaApiLeagueSeasonItem = {
  tdid: "t_pr8N_8121",
  createTime: 1788357738,
  title: "ZAKRĘCONA - Wtorkowe Granie w Poznań Darts Club Wrzesień #2",
  t_date: 1788885000,
  status: 40,
  s: 218386,
  d: 13925,
};

describe("isLeagueListPayload", () => {
  test("should accept an array", () => {
    expect(isLeagueListPayload(wtorkoweSample)).toBe(true);
    expect(isLeagueListPayload([])).toBe(true);
  });

  test("should reject the -50 error body", () => {
    expect(isLeagueListPayload(-50)).toBe(false);
    expect(isLeagueListPayload({ result: -50 })).toBe(false);
  });

  test("should reject objects and null", () => {
    expect(isLeagueListPayload(null)).toBe(false);
    expect(isLeagueListPayload({ lgid: "lg_mD0F_0939" })).toBe(false);
  });
});

describe("isSeasonListPayload", () => {
  test("should accept an array", () => {
    expect(isSeasonListPayload([sampleSeason])).toBe(true);
    expect(isSeasonListPayload([])).toBe(true);
  });

  test("should reject the -50 error body", () => {
    expect(isSeasonListPayload(-50)).toBe(false);
    expect(isSeasonListPayload({ result: -50 })).toBe(false);
  });
});

describe("toLeagueDto", () => {
  test("should map lgid, title, portal href, and events", () => {
    const dto = toLeagueDto(sampleLeague, []);

    expect(dto.lgid).toBe("lg_mD0F_0939");
    expect(dto.league_name).toBe(
      "Wtorkowe Granie w Poznań Darts Club (Wrzesień)"
    );
    expect(dto.portal_href).toBe(
      `${NAKKA_LEAGUE_BASE_URL}/portal.php?lgid=lg_mD0F_0939`
    );
    expect(dto.events).toEqual([]);
  });

  test("should fall back to Unknown League when title is missing", () => {
    const dto = toLeagueDto({ ...sampleLeague, title: "" }, []);
    expect(dto.league_name).toBe("Unknown League");
  });
});

describe("toLeagueEventDto", () => {
  test("should map tdid, title, href, history date, and completed status", () => {
    const parsedDate = new Date(Date.UTC(2026, 8, 8, 0, 0, 0, 0));
    const dto = toLeagueEventDto(sampleSeason, "lg_mD0F_0939", parsedDate);

    expect(dto.event_id).toBe("t_pr8N_8121");
    expect(dto.event_name).toBe(
      "ZAKRĘCONA - Wtorkowe Granie w Poznań Darts Club Wrzesień #2"
    );
    expect(dto.event_href).toBe(
      `${NAKKA_LEAGUE_BASE_URL}/season.php?id=t_pr8N_8121`
    );
    expect(dto.league_id).toBe("lg_mD0F_0939");
    expect(dto.event_status).toBe("completed");
    expect(dto.event_date).toBe(parsedDate);
  });

  test("should fall back to Unknown Event when title is missing", () => {
    const parsedDate = new Date(Date.UTC(2026, 8, 8, 0, 0, 0, 0));
    const dto = toLeagueEventDto(
      { ...sampleSeason, title: "" },
      "lg_mD0F_0939",
      parsedDate
    );

    expect(dto.event_name).toBe("Unknown Event");
  });
});

describe("shouldKeepCompletedLeagueEvent", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  test("should keep a completed event inside the last 6 months", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(sampleSeason, parsedDate, sixMonthsAgo)
    ).toBe(true);
  });

  test("should drop status other than 40", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        { ...sampleSeason, status: 30 },
        parsedDate,
        sixMonthsAgo
      )
    ).toBe(false);
  });

  test("should drop missing tdid", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        { ...sampleSeason, tdid: "" },
        parsedDate,
        sixMonthsAgo
      )
    ).toBe(false);
  });

  test("should drop a missing history date", () => {
    expect(
      shouldKeepCompletedLeagueEvent(sampleSeason, null, sixMonthsAgo)
    ).toBe(false);
  });

  test("should drop a date older than 6 months", () => {
    const parsedDate = new Date("2026-02-01T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(sampleSeason, parsedDate, sixMonthsAgo)
    ).toBe(false);
  });
});
