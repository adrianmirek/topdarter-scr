/**
 * Unit tests for Nakka match list mapping and history payload rules.
 */

import {
  extractTournamentIdFromHref,
  isHistoryListPayload,
  parseMatchDateFromStartTime,
  shouldKeepHistoryMatch,
  toMatchDto,
  toMatchHistoryItem,
  type NakkaApiMatchHistoryItem,
} from "../lib/nakka-api-matches";
import { NAKKA_BASE_URL } from "../lib/constants";
import type { NakkaMatchScrapedDTO } from "../lib/types";

const sampleMatch: NakkaApiMatchHistoryItem = {
  tmid: "t_Bhce_5464_t_4_2F7T_Tal5",
  startTime: 1772146718,
  title: "Agawa 08 2026 Final",
  p1tpid: "2F7T",
  p1name: "Krasnowski Mariusz",
  p2tpid: "Tal5",
  p2name: "Kosicki Kamil",
};

const sampleDto: NakkaMatchScrapedDTO = {
  nakka_match_identifier: "t_Bhce_5464_t_4_2F7T_Tal5",
  nakka_mid: "iFLeTEwI_1789162367448",
  match_type: "Agawa 08 2026 Final",
  first_player_name: "Krasnowski Mariusz",
  first_player_code: "2F7T",
  second_player_name: "Kosicki Kamil",
  second_player_code: "Tal5",
  href: `${NAKKA_BASE_URL}/n01_view.html?tmid=t_Bhce_5464_t_4_2F7T_Tal5`,
  match_date: new Date(1772146718 * 1000),
};

const agawaSample: NakkaApiMatchHistoryItem[] = [
  sampleMatch,
  {
    tmid: "t_Bhce_5464_t_3_2F7T_pyOY",
    startTime: 1772145735,
    title: "Agawa 08 2026 Semi-final",
    p1tpid: "2F7T",
    p1name: "Krasnowski Mariusz",
    p2tpid: "pyOY",
    p2name: "Brzóska Mateusz",
  },
  {
    tmid: "t_Bhce_5464_t_3_8IA3_Tal5",
    startTime: 1772145483,
    title: "Agawa 08 2026 Semi-final",
    p1tpid: "Tal5",
    p1name: "Kosicki Kamil",
    p2tpid: "8IA3",
    p2name: "Roszyk Tomasz",
  },
];

describe("extractTournamentIdFromHref", () => {
  test("should extract tdid from a tournament comp.php href", () => {
    expect(
      extractTournamentIdFromHref(
        "https://n01darts.com/n01/tournament/comp.php?id=t_Bhce_5464"
      )
    ).toBe("t_Bhce_5464");
  });

  test("should throw when id is missing", () => {
    expect(() =>
      extractTournamentIdFromHref("https://n01darts.com/n01/tournament/comp.php")
    ).toThrow("Could not extract tournament ID from URL");
  });
});

describe("isHistoryListPayload", () => {
  test("should accept a documented match list success body", () => {
    expect(
      isHistoryListPayload({
        result: 0,
        list: [
          {
            mid: "iFLeTEwI_1789162367448",
            tmid: "t_YGZ2_9813_s2_4_ItHr_JDLg",
            startTime: 1789162367,
            title: "Rankingowy Piątek #12",
          },
        ],
      })
    ).toBe(true);
    expect(isHistoryListPayload({ result: 0, list: [] })).toBe(true);
  });

  test("should reject error bodies and missing list", () => {
    expect(isHistoryListPayload(-50)).toBe(false);
    expect(isHistoryListPayload({ result: -50 })).toBe(false);
    expect(isHistoryListPayload({ list: [] })).toBe(false);
    expect(isHistoryListPayload({ time: 1789325076883, list: agawaSample })).toBe(
      false
    );
  });

  test("should reject a top-level array or missing list", () => {
    expect(isHistoryListPayload(agawaSample)).toBe(false);
    expect(isHistoryListPayload({ time: 1 })).toBe(false);
    expect(isHistoryListPayload(null)).toBe(false);
  });
});

describe("toMatchHistoryItem", () => {
  test("should map public list fields onto NakkaMatchScrapedDTO properties", () => {
    const item = toMatchHistoryItem({
      mid: "iFLeTEwI_1789162367448",
      tmid: "t_YGZ2_9813_s2_4_ItHr_JDLg",
      startTime: 1789162367,
      title: "Rankingowy Piątek #12 Finał",
      match_type: "01",
      statsData: [
        { name: "Sławomir Owczarek", tpid: "ItHr" },
        { name: "Norbert Karolak", tpid: "JDLg" },
      ],
    });

    expect(item.nakka_match_identifier).toBe("t_YGZ2_9813_s2_4_ItHr_JDLg");
    expect(item.nakka_mid).toBe("iFLeTEwI_1789162367448");
    expect(item.match_type).toBe("Rankingowy Piątek #12 Finał");
    expect(item.first_player_name).toBe("Sławomir Owczarek");
    expect(item.first_player_code).toBe("ItHr");
    expect(item.second_player_name).toBe("Norbert Karolak");
    expect(item.second_player_code).toBe("JDLg");
    expect(item.href).toBe(
      `${NAKKA_BASE_URL}/n01_view.html?tmid=t_YGZ2_9813_s2_4_ItHr_JDLg`
    );
    expect(item.match_date?.toISOString()).toBe(
      new Date(1789162367 * 1000).toISOString()
    );
  });
});

describe("parseMatchDateFromStartTime", () => {
  test("should return null for missing or non-positive startTime", () => {
    expect(parseMatchDateFromStartTime(0)).toBeNull();
    expect(parseMatchDateFromStartTime(-1)).toBeNull();
  });

  test("should convert unix seconds without the tournament -4h midnight adjustment", () => {
    const result = parseMatchDateFromStartTime(1772146718);
    expect(result).not.toBeNull();
    expect(result?.toISOString()).toBe(new Date(1772146718 * 1000).toISOString());
  });
});

describe("toMatchDto", () => {
  test("should map tmid, names, codes, href, and startTime", () => {
    const dto = toMatchDto(sampleMatch);

    expect(dto.nakka_match_identifier).toBe("t_Bhce_5464_t_4_2F7T_Tal5");
    expect(dto.nakka_mid).toBe("");
    expect(dto.match_type).toBe("Agawa 08 2026 Final");
    expect(dto.first_player_name).toBe("Krasnowski Mariusz");
    expect(dto.first_player_code).toBe("2F7T");
    expect(dto.second_player_name).toBe("Kosicki Kamil");
    expect(dto.second_player_code).toBe("Tal5");
    expect(dto.href).toBe(
      `${NAKKA_BASE_URL}/n01_view.html?tmid=t_Bhce_5464_t_4_2F7T_Tal5`
    );
    expect(dto.match_date?.toISOString()).toBe(
      new Date(1772146718 * 1000).toISOString()
    );
  });

  test("should fall back to Unknown names and unknown match type", () => {
    const dto = toMatchDto({
      ...sampleMatch,
      title: "",
      p1name: "",
      p2name: "",
    });

    expect(dto.match_type).toBe("unknown");
    expect(dto.first_player_name).toBe("Unknown");
    expect(dto.second_player_name).toBe("Unknown");
  });

  test("should set match_date to null when startTime is missing", () => {
    const dto = toMatchDto({ ...sampleMatch, startTime: 0 });
    expect(dto.match_date).toBeNull();
  });
});

describe("shouldKeepHistoryMatch", () => {
  test("should keep a row with tmid and both player codes", () => {
    expect(shouldKeepHistoryMatch(sampleDto)).toBe(true);
  });

  test("should drop missing tmid", () => {
    expect(
      shouldKeepHistoryMatch({ ...sampleDto, nakka_match_identifier: "" })
    ).toBe(false);
  });

  test("should drop missing player codes", () => {
    expect(
      shouldKeepHistoryMatch({ ...sampleDto, first_player_code: "" })
    ).toBe(false);
    expect(
      shouldKeepHistoryMatch({ ...sampleDto, second_player_code: "" })
    ).toBe(false);
  });
});
