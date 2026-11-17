// Стартовая конфигурация ивента. Всё можно поменять в «Настройках» прямо в приложении.
const DEFAULT_DIFFICULTIES = [
  { id: 'green',    name: 'Зелёная',    color: '#3ddc84', duration: 'до 4 ч',   currency: 10 },
  { id: 'yellow',   name: 'Жёлтая',     color: '#ffd23f', duration: '4–10 ч',   currency: 20 },
  { id: 'red',      name: 'Красная',    color: '#ff4d4d', duration: '10–20 ч',  currency: 35 },
  { id: 'purple',   name: 'Фиолетовая', color: '#b26bff', duration: '20–40 ч',  currency: 55 },
  { id: 'burgundy', name: 'Бордовая',   color: '#c2185b', duration: '40+ ч',    currency: 80 },
];

const DEFAULT_POOLS = {
  green: ['Inside', 'Limbo', 'Portal', 'Superhot', 'What Remains of Edith Finch', 'Firewatch', 'Journey', 'Little Nightmares', 'Gris', 'Untitled Goose Game'],
  yellow: ['Portal 2', 'Little Nightmares II', 'Hellblade: Senua\'s Sacrifice', 'Ori and the Blind Forest', 'Titanfall 2', 'Cuphead', 'Resident Evil 2 (2019)', 'It Takes Two', 'Celeste', 'Hi-Fi Rush'],
  red: ['DOOM (2016)', 'Dead Space (2023)', 'BioShock Infinite', 'Metro Exodus', 'Hades', 'A Plague Tale: Innocence', 'Resident Evil Village', 'Prey (2017)', 'Control', 'Ori and the Will of the Wisps'],
  purple: ['Hollow Knight', 'Dark Souls III', 'Sekiro', 'God of War (2018)', 'Death Stranding', 'Bloodborne', 'Horizon Zero Dawn', 'Lies of P', 'Cyberpunk 2077', 'Mass Effect 2'],
  burgundy: ['Elden Ring', 'The Witcher 3', 'Red Dead Redemption 2', 'Persona 5 Royal', 'Baldur\'s Gate 3', 'Kingdom Come: Deliverance II', 'Dragon Age: Inquisition', 'Xenoblade Chronicles 3'],
};

// Координаты в системе 1600x1000. Порядок звёзд = порядок прохождения.
// edges — линии рисунка созвездия; если не заданы, звёзды соединяются цепочкой.
const RAW_CONSTELLATIONS = [
  { id: 'cassiopeia', name: 'Кассиопея', at: [230, 170], reward: 'Титул «Королева небес»', bonus: 50,
    stars: [[0, 0, 'green'], [70, 80, 'green'], [150, 30, 'yellow'], [230, 100, 'yellow'], [300, 20, 'red']] },
  { id: 'ursa', name: 'Большая Медведица', at: [620, 110], reward: 'Титул «Покоритель Ковша»', bonus: 120,
    stars: [[0, 0, 'green'], [80, 20, 'yellow'], [150, 50, 'yellow'], [220, 90, 'red'], [230, 170, 'red'], [340, 180, 'purple'], [350, 90, 'purple']],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  { id: 'corona', name: 'Северная Корона', at: [1120, 140], reward: 'Корона в оверлее', bonus: 90,
    stars: [[0, 50, 'green'], [35, 5, 'green'], [95, -15, 'yellow'], [160, -5, 'red'], [205, 35, 'red'], [220, 95, 'purple']] },
  { id: 'orion', name: 'Орион', at: [140, 420], reward: 'Титул «Небесный охотник»', bonus: 200,
    stars: [[100, -60, 'yellow'], [20, 10, 'red'], [60, 130, 'red'], [120, 150, 'purple'], [180, 170, 'purple'], [240, 290, 'burgundy']] },
  { id: 'lyra', name: 'Лира', at: [720, 430], reward: 'Заказ трека от зрителей', bonus: 150,
    stars: [[0, 0, 'green'], [40, 60, 'yellow'], [20, 140, 'red'], [90, 160, 'purple'], [110, 80, 'burgundy']],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
  { id: 'cygnus', name: 'Лебедь', at: [930, 370], reward: 'Титул «Белый лебедь»', bonus: 130,
    stars: [[110, 0, 'green'], [100, 100, 'yellow'], [0, 80, 'yellow'], [200, 115, 'red'], [95, 200, 'purple'], [90, 300, 'purple']],
    edges: [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5]] },
  { id: 'scorpius', name: 'Скорпион', at: [1300, 410], reward: 'Яд: зритель выбирает челлендж соседу', bonus: 230,
    stars: [[0, -20, 'yellow'], [50, 30, 'red'], [80, 110, 'red'], [100, 190, 'purple'], [160, 260, 'purple'], [240, 250, 'burgundy'], [260, 190, 'burgundy']] },
  { id: 'leo', name: 'Лев', at: [400, 730], reward: 'Титул «Царь зверей»', bonus: 200,
    stars: [[20, 150, 'green'], [10, 70, 'yellow'], [50, 10, 'red'], [110, 30, 'red'], [130, 90, 'purple'], [260, 110, 'purple'], [340, 160, 'burgundy']],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 0]] },
  { id: 'draco', name: 'Дракон', at: [850, 790], reward: 'Главный приз ивента', bonus: 400,
    stars: [[0, 0, 'red'], [60, -40, 'red'], [130, -20, 'purple'], [170, 40, 'purple'], [240, 60, 'purple'], [310, 30, 'burgundy'], [380, 60, 'burgundy'], [420, 130, 'burgundy']] },
  { id: 'andromeda', name: 'Андромеда', at: [1320, 880], reward: 'Титул «Туманность»', bonus: 40,
    stars: [[0, 0, 'green'], [80, -25, 'green'], [160, -55, 'yellow'], [240, -95, 'yellow']] },
];

const PLAYER_COLORS = ['#4fc3f7', '#ff8a65', '#aed581', '#f06292', '#ffd54f', '#9575cd', '#4db6ac', '#e57373'];

function defaultState() {
  return {
    version: 1,
    settings: { currencyName: 'Звёздная пыль', currencyIcon: '✦', exclusive: true, title: 'Звёздный ивент' },
    difficulties: JSON.parse(JSON.stringify(DEFAULT_DIFFICULTIES)),
    pools: JSON.parse(JSON.stringify(DEFAULT_POOLS)),
    constellations: RAW_CONSTELLATIONS.map(c => ({
      id: c.id, name: c.name, reward: c.reward, bonus: c.bonus,
      stars: c.stars.map(([x, y, d]) => ({ x: c.at[0] + x, y: c.at[1] + y, d })),
      edges: c.edges || null,
    })),
    players: ['Игрок 1', 'Игрок 2', 'Игрок 3'].map((name, i) => newPlayer(name, PLAYER_COLORS[i])),
    log: [],
  };
}

function newPlayer(name, color) {
  return { id: 'p' + Math.random().toString(36).slice(2, 9), name, color, balance: 0, active: null, done: [] };
}
