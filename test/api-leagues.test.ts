/**
 * Unit tests for Nakka league list mapping and season-date rules.
 */

import {
  isLeagueListPayload,
  isSeasonListPayload,
  resolveLeagueListMaxPages,
  resolveSeasonListMaxPages,
  shouldKeepCompletedLeagueEvent,
  toLeagueDto,
  toLeagueEventDto,
  toLeagueEventListDto,
  LEAGUE_LIST_MAX_PAGES,
  LEAGUE_LIST_RECENT_SYNC_MAX_PAGES,
  SEASON_LIST_MAX_PAGES,
  SEASON_LIST_RECENT_SYNC_MAX_PAGES,
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
  test("should accept result 0 with a list array", () => {
    expect(isLeagueListPayload({ result: 0, list: wtorkoweSample })).toBe(true);
    expect(isLeagueListPayload({ result: 0, list: [] })).toBe(true);
  });

  test("should reject the -50 error body", () => {
    expect(isLeagueListPayload(-50)).toBe(false);
    expect(isLeagueListPayload({ result: -50 })).toBe(false);
    expect(isLeagueListPayload({ list: wtorkoweSample })).toBe(false);
  });

  test("should reject a raw array, objects, and null", () => {
    expect(isLeagueListPayload(wtorkoweSample)).toBe(false);
    expect(isLeagueListPayload(null)).toBe(false);
    expect(isLeagueListPayload({ lgid: "lg_mD0F_0939" })).toBe(false);
  });
});

describe("isSeasonListPayload", () => {
  test("should accept result 0 with a list array", () => {
    expect(isSeasonListPayload({ result: 0, list: [sampleSeason] })).toBe(true);
    expect(isSeasonListPayload({ result: 0, list: [] })).toBe(true);
  });

  test("should reject the -50 error body", () => {
    expect(isSeasonListPayload(-50)).toBe(false);
    expect(isSeasonListPayload({ result: -50 })).toBe(false);
    expect(isSeasonListPayload({ list: [sampleSeason] })).toBe(false);
  });

  test("should reject a raw array", () => {
    expect(isSeasonListPayload([sampleSeason])).toBe(false);
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

describe("toLeagueEventListDto", () => {
  test("should map tdid, title, href, and completed status without a date", () => {
    const dto = toLeagueEventListDto(sampleSeason, "lg_mD0F_0939");

    expect(dto.event_id).toBe("t_pr8N_8121");
    expect(dto.event_name).toBe(
      "ZAKRĘCONA - Wtorkowe Granie w Poznań Darts Club Wrzesień #2"
    );
    expect(dto.event_href).toBe(
      `${NAKKA_LEAGUE_BASE_URL}/season.php?id=t_pr8N_8121`
    );
    expect(dto.league_id).toBe("lg_mD0F_0939");
    expect(dto.event_status).toBe("completed");
    expect(dto.event_date).toBeNull();
  });

  test("should fall back to Unknown Event when title is missing", () => {
    const dto = toLeagueEventListDto({ ...sampleSeason, title: "" }, "lg_mD0F_0939");
    expect(dto.event_name).toBe("Unknown Event");
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

  test("should keep a completed 501 event inside the last 6 months", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        sampleSeason,
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(true);
  });

  test("should drop a non-501 event even when date and status would keep", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        sampleSeason,
        parsedDate,
        now,
        sixMonthsAgo,
        false
      )
    ).toBe(false);
  });

  test("should drop status other than 40", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        { ...sampleSeason, status: 30 },
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(false);
  });

  test("should drop missing tdid", () => {
    const parsedDate = new Date("2026-09-08T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        { ...sampleSeason, tdid: "" },
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(false);
  });

  test("should drop a missing history date", () => {
    expect(
      shouldKeepCompletedLeagueEvent(sampleSeason, null, now, sixMonthsAgo, true)
    ).toBe(false);
  });

  test("should drop a future history date", () => {
    const parsedDate = new Date("2026-10-01T00:00:00.000Z");
    expect(
      shouldKeepCompletedLeagueEvent(
        sampleSeason,
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
      shouldKeepCompletedLeagueEvent(
        sampleSeason,
        parsedDate,
        now,
        sixMonthsAgo,
        true
      )
    ).toBe(false);
  });
});

describe("resolveLeagueListMaxPages", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  test("should use LEAGUE_LIST_MAX_PAGES when last sync is older than one month", () => {
    expect(
      resolveLeagueListMaxPages(new Date("2026-08-19T12:00:00.000Z"), now)
    ).toBe(LEAGUE_LIST_MAX_PAGES);
    expect(
      resolveLeagueListMaxPages(new Date("2026-07-01T00:00:00.000Z"), now)
    ).toBe(LEAGUE_LIST_MAX_PAGES);
  });

  test("should use 1 page when last sync is newer than one month", () => {
    expect(
      resolveLeagueListMaxPages(new Date("2026-08-21T12:00:00.000Z"), now)
    ).toBe(LEAGUE_LIST_RECENT_SYNC_MAX_PAGES);
    expect(
      resolveLeagueListMaxPages(new Date("2026-09-10T00:00:00.000Z"), now)
    ).toBe(LEAGUE_LIST_RECENT_SYNC_MAX_PAGES);
  });

  test("should treat a last sync exactly one month ago as recent", () => {
    expect(
      resolveLeagueListMaxPages(new Date("2026-08-20T12:00:00.000Z"), now)
    ).toBe(LEAGUE_LIST_RECENT_SYNC_MAX_PAGES);
  });
});

describe("resolveSeasonListMaxPages", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  test("should use SEASON_LIST_MAX_PAGES when last sync is older than one month", () => {
    expect(
      resolveSeasonListMaxPages(new Date("2026-08-19T12:00:00.000Z"), now)
    ).toBe(SEASON_LIST_MAX_PAGES);
  });

  test("should use 1 page when last sync is newer than one month", () => {
    expect(
      resolveSeasonListMaxPages(new Date("2026-09-10T00:00:00.000Z"), now)
    ).toBe(SEASON_LIST_RECENT_SYNC_MAX_PAGES);
  });
});
