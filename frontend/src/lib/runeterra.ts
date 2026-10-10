/*
 * Legends of Runeterra champion cards, by League champion name: [set, card code, region, head x, head y].
 * The focus is where the champion's head is in the art (fractions of its width and height): every card is a 2048x1024
 * landscape image, and the frames that show it (phone banner, wide hero) each crop a different part, so the head is
 * what must stay in view. Read off each card by eye against a 10% grid.
 * Riot publishes the full art on its own CDN (Data Dragon for LoR); we link to it and never copy it.
 * Generated from the set data at https://dd.b.pvp.net/latest/set<N>/en_us/data/set<N>-en_us.json (sets 1-8, collectible champions).
 */
const CARDS: Record<string, [number, string, string, number, number]> = {
  "Ahri": [5, "05IO004", "Ionia", 0.53, 0.37],
  "Akshan": [4, "04SH130", "Shurima", 0.17, 0.28],
  "Anivia": [1, "01FR024", "Freljord", 0.36, 0.13],
  "Annie": [6, "06NX012", "Noxus", 0.68, 0.33],
  "Aphelios": [3, "03MT217", "Targon", 0.47, 0.29],
  "Ashe": [1, "01FR038", "Freljord", 0.24, 0.14],
  "Aurelion Sol": [3, "03MT087", "Targon", 0.55, 0.12],
  "Azir": [4, "04SH003", "Shurima", 0.31, 0.24],
  "Bard": [6, "06RU001", "Runeterra", 0.40, 0.17],
  "Braum": [1, "01FR009", "Freljord", 0.68, 0.28],
  "Caitlyn": [5, "05PZ006", "PiltoverZaun", 0.41, 0.25],
  "Darius": [1, "01NX038", "Noxus", 0.40, 0.26],
  "Diana": [3, "03MT056", "Targon", 0.42, 0.28],
  "Draven": [1, "01NX020", "Noxus", 0.69, 0.30],
  "Ekko": [4, "04PZ001", "PiltoverZaun", 0.66, 0.19],
  "Elise": [1, "01SI053", "ShadowIsles", 0.36, 0.28],
  "Evelynn": [6, "06RU025", "Runeterra", 0.52, 0.17],
  "Ezreal": [1, "01PZ036", "PiltoverZaun", 0.34, 0.22],
  "Fiora": [1, "01DE045", "Demacia", 0.80, 0.39],
  "Fizz": [2, "02BW046", "BandleCity", 0.47, 0.25],
  "Galio": [5, "05DE009", "Demacia", 0.55, 0.27],
  "Gangplank": [2, "02BW032", "Bilgewater", 0.55, 0.28],
  "Garen": [1, "01DE012", "Demacia", 0.64, 0.18],
  "Gnar": [5, "05BC161", "BandleCity", 0.63, 0.33],
  "Gwen": [6, "06SI012", "ShadowIsles", 0.66, 0.28],
  "Hecarim": [1, "01SI042", "ShadowIsles", 0.59, 0.14],
  "Heimerdinger": [1, "01PZ056", "BandleCity", 0.63, 0.37],
  "Illaoi": [6, "06BW006", "Bilgewater", 0.40, 0.19],
  "Irelia": [4, "04IO005", "Ionia", 0.47, 0.17],
  "Janna": [8, "08PZ001", "PiltoverZaun", 0.68, 0.15],
  "Jarvan IV": [4, "04DE008", "Demacia", 0.69, 0.14],
  "Jayce": [5, "05PZ022", "PiltoverZaun", 0.40, 0.22],
  "Jhin": [6, "06RU002", "Runeterra", 0.41, 0.18],
  "Jinx": [1, "01PZ040", "PiltoverZaun", 0.47, 0.58],
  "Kai'Sa": [6, "06SH009", "Shurima", 0.27, 0.25],
  "Kalista": [1, "01SI030", "ShadowIsles", 0.46, 0.14],
  "Karma": [1, "01IO041", "Ionia", 0.53, 0.22],
  "Katarina": [1, "01NX042", "Noxus", 0.50, 0.28],
  "Kennen": [5, "05BC058", "BandleCity", 0.57, 0.33],
  "Kindred": [4, "04SI005", "ShadowIsles", 0.64, 0.30],
  "LeBlanc": [4, "04NX004", "Noxus", 0.52, 0.27],
  "Lee Sin": [2, "02IO006", "Ionia", 0.58, 0.22],
  "Leona": [3, "03MT054", "Targon", 0.52, 0.19],
  "Lissandra": [4, "04FR005", "Freljord", 0.55, 0.22],
  "Lucian": [1, "01DE022", "Demacia", 0.57, 0.22],
  "Lulu": [3, "03IO002", "BandleCity", 0.58, 0.38],
  "Lux": [1, "01DE042", "Demacia", 0.39, 0.25],
  "Malphite": [4, "04MT008", "Targon", 0.69, 0.20],
  "Maokai": [2, "02SI008", "ShadowIsles", 0.51, 0.34],
  "Miss Fortune": [2, "02BW022", "Bilgewater", 0.82, 0.22],
  "Mordekaiser": [8, "08SI042", "ShadowIsles", 0.63, 0.27],
  "Morgana": [8, "08MT003", "Targon", 0.59, 0.19],
  "Nami": [5, "05BW005", "Bilgewater", 0.69, 0.27],
  "Nasus": [4, "04SH047", "Shurima", 0.56, 0.17],
  "Nautilus": [2, "02BW053", "Bilgewater", 0.62, 0.19],
  "Nilah": [8, "08BW008", "Bilgewater", 0.54, 0.28],
  "Nocturne": [3, "03SI005", "ShadowIsles", 0.63, 0.25],
  "Pantheon": [5, "05MT003", "Targon", 0.36, 0.28],
  "Poppy": [5, "05BC041", "BandleCity", 0.60, 0.25],
  "Pyke": [4, "04BW005", "Bilgewater", 0.69, 0.24],
  "Quinn": [2, "02DE006", "Demacia", 0.68, 0.20],
  "Rek'Sai": [4, "04SH019", "Shurima", 0.54, 0.25],
  "Renekton": [4, "04SH067", "Shurima", 0.60, 0.21],
  "Riven": [3, "03NX007", "Noxus", 0.54, 0.24],
  "Rumble": [5, "05BC088", "BandleCity", 0.43, 0.17],
  "Samira": [7, "07NX007", "Noxus", 0.56, 0.17],
  "Sejuani": [2, "02FR002", "Freljord", 0.55, 0.21],
  "Senna": [5, "05SI009", "ShadowIsles", 0.40, 0.33],
  "Sett": [7, "07IO011", "Ionia", 0.58, 0.45],
  "Shen": [1, "01IO032", "Ionia", 0.40, 0.34],
  "Shyvana": [3, "03DE011", "Demacia", 0.48, 0.18],
  "Sion": [5, "05NX001", "Noxus", 0.51, 0.32],
  "Sivir": [4, "04SH020", "Shurima", 0.34, 0.26],
  "Soraka": [3, "03MT055", "Targon", 0.50, 0.15],
  "Swain": [2, "02NX007", "Noxus", 0.75, 0.22],
  "Tahm Kench": [3, "03BW004", "Bilgewater", 0.47, 0.32],
  "Taliyah": [4, "04SH073", "Shurima", 0.65, 0.30],
  "Taric": [3, "03MT058", "Targon", 0.52, 0.22],
  "Teemo": [1, "01PZ008", "BandleCity", 0.56, 0.33],
  "Thresh": [1, "01SI052", "ShadowIsles", 0.36, 0.20],
  "Tristana": [5, "05BC133", "BandleCity", 0.56, 0.30],
  "Trundle": [3, "03FR006", "Freljord", 0.52, 0.17],
  "Tryndamere": [1, "01FR039", "Freljord", 0.54, 0.12],
  "Twisted Fate": [2, "02BW026", "Bilgewater", 0.38, 0.22],
  "Udyr": [5, "05FR013", "Freljord", 0.50, 0.20],
  "Veigar": [5, "05BC093", "BandleCity", 0.49, 0.20],
  "Vi": [2, "02PZ008", "PiltoverZaun", 0.48, 0.18],
  "Viego": [4, "04SI055", "ShadowIsles", 0.77, 0.24],
  "Viktor": [3, "03PZ003", "PiltoverZaun", 0.64, 0.23],
  "Vladimir": [1, "01NX006", "Noxus", 0.58, 0.16],
  "Volibear": [8, "08FR001", "Freljord", 0.59, 0.25],
  "Xerath": [5, "05SH014", "Shurima", 0.55, 0.26],
  "Yasuo": [1, "01IO015", "Ionia", 0.60, 0.14],
  "Yuumi": [5, "05BC029", "BandleCity", 0.55, 0.30],
  "Zed": [1, "01IO009", "Ionia", 0.37, 0.17],
  "Ziggs": [5, "05BC163", "BandleCity", 0.47, 0.30],
  "Zilean": [4, "04SH039", "Shurima", 0.62, 0.27],
  "Zoe": [3, "03MT009", "Targon", 0.47, 0.40],
}

import { IMAGE_BASE } from './imageBase'

const ART = 'https://dd.b.pvp.net/latest'

/** Region colours: the slideshow tints its accent, the embers and the progress bar with the card's region. */
const REGION_COLOR: Record<string, string> = {
  Demacia: '#e3c068',
  Noxus: '#e0524a',
  Ionia: '#f07aa8',
  Freljord: '#74cdee',
  PiltoverZaun: '#e8a93c',
  ShadowIsles: '#4fd6b8',
  Bilgewater: '#ea6a3c',
  Targon: '#9a86ff',
  Shurima: '#eccb52',
  BandleCity: '#86dc62',
  Runeterra: '#cfcfd8',
}
const REGION_NAME: Record<string, string> = { PiltoverZaun: 'Piltover & Zaun', ShadowIsles: 'Shadow Isles', BandleCity: 'Bandle City' }

/** Where the champion sits in an image, as fractions of its width and height. */
export type Focus = [number, number]
/** Every Runeterra card image is 2048x1024. */
export const CARD_RATIO = 2
/** League splash art (the wide one, not the loading-screen portrait) is 1215x717. */
export const SPLASH_RATIO = 1215 / 717
export const SPLASH_FOCUS: Focus = [0.58, 0.26]
export const splashUrl = (key: string): string => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_0.jpg`

/** A soft cut-out of the champion in the card art (see public/masks), used as the near layer of the depth effect. */
export const maskUrl = (champion: string): string => `${import.meta.env.BASE_URL}masks/${champion.replace(/[ ']/g, '')}.png`

/** A wide frame is centred a little below the head, so the head sits in the upper-middle of the banner, clear of the fade at its foot. */
const HEAD_DROP = 0.06

/**
 * The `object-position` that keeps the focus in view when an image of `imageRatio` (width / height) is cropped
 * to fill a frame of `frameRatio` with object-fit: cover. A wide image in a tall frame loses its sides, so the
 * horizontal focus matters; a frame wider than the image loses top and bottom, so the vertical focus does.
 */
export function coverPosition(focus: Focus, imageRatio: number, frameRatio: number): string {
  const place = (f: number, visible: number) => (visible >= 1 ? 0.5 : Math.min(1, Math.max(0, (f - visible / 2) / (1 - visible))))
  if (frameRatio < imageRatio) return `${(place(focus[0], frameRatio / imageRatio) * 100).toFixed(1)}% 50%`
  return `50% ${(place(Math.min(1, focus[1] + HEAD_DROP), imageRatio / frameRatio) * 100).toFixed(1)}%`
}

export interface RuneterraCard {
  /** Our own small WebP copy (R2 in production); `fallback` is Riot's original, used when ours is missing. */
  url: string
  fallback: string
  mask: string
  focus: Focus
  /** The region's key (for example PiltoverZaun); regionName is the one to show. */
  region: string
  regionName: string
  color: string
}

/** The champion's Runeterra card art, or null when it has none (most of the newer champions). */
export function cardFor(champion: string): RuneterraCard | null {
  const c = CARDS[champion]
  if (!c) return null
  const [set, code, region, fx, fy] = c
  return {
    url: `${IMAGE_BASE}/art/${code}.webp`,
    fallback: `${ART}/set${set}/en_us/img/cards/${code}-full.png`,
    mask: maskUrl(champion),
    focus: [fx, fy],
    region,
    regionName: REGION_NAME[region] ?? region,
    color: REGION_COLOR[region] ?? '#cfcfd8',
  }
}
