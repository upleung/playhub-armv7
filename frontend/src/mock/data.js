const mockSources = [
  { uid: 's0', key: 'source_a', name: '量子资源', type: 0, api: 'https://api.a.com', searchable: 1, quickSearch: 1, filterable: 1 },
  { uid: 's1', key: 'source_b', name: '非凡资源', type: 0, api: 'https://api.b.com', searchable: 1, quickSearch: 1, filterable: 1 },
  { uid: 's2', key: 'source_c', name: '闪电资源', type: 0, api: 'https://api.c.com', searchable: 1, quickSearch: 1, filterable: 1 },
  { uid: 's3', key: 'source_d', name: '光速资源', type: 0, api: 'https://api.d.com', searchable: 0, quickSearch: 0, filterable: 1 },
]

const mockCategories = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '连续剧' },
  { type_id: '3', type_name: '综艺' },
  { type_id: '4', type_name: '动漫' },
  { type_id: '5', type_name: '纪录片' },
]

const mockHomeVideos = [
  { vod_id: '1001', vod_name: '流浪地球2', vod_pic: 'https://picsum.photos/seed/m1/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '科幻' },
  { vod_id: '1002', vod_name: '满江红', vod_pic: 'https://picsum.photos/seed/m2/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '悬疑' },
  { vod_id: '1003', vod_name: '三体', vod_pic: 'https://picsum.photos/seed/m3/300/400', vod_remarks: '更新至30集', vod_year: '2023', type_name: '科幻' },
  { vod_id: '1004', vod_name: '狂飙', vod_pic: 'https://picsum.photos/seed/m4/300/400', vod_remarks: '全39集', vod_year: '2023', type_name: '犯罪' },
  { vod_id: '1005', vod_name: '流浪地球', vod_pic: 'https://picsum.photos/seed/m5/300/400', vod_remarks: 'HD', vod_year: '2019', type_name: '科幻' },
  { vod_id: '1006', vod_name: '长津湖', vod_pic: 'https://picsum.photos/seed/m6/300/400', vod_remarks: 'HD', vod_year: '2021', type_name: '战争' },
  { vod_id: '1007', vod_name: '你好，李焕英', vod_pic: 'https://picsum.photos/seed/m7/300/400', vod_remarks: 'HD', vod_year: '2021', type_name: '喜剧' },
  { vod_id: '1008', vod_name: '哪吒之魔童降世', vod_pic: 'https://picsum.photos/seed/m8/300/400', vod_remarks: 'HD', vod_year: '2019', type_name: '动画' },
  { vod_id: '1009', vod_name: '战狼2', vod_pic: 'https://picsum.photos/seed/m9/300/400', vod_remarks: 'HD', vod_year: '2017', type_name: '动作' },
  { vod_id: '1010', vod_name: '长空之王', vod_pic: 'https://picsum.photos/seed/m10/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '动作' },
  { vod_id: '1011', vod_name: '消失的她', vod_pic: 'https://picsum.photos/seed/m11/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '悬疑' },
  { vod_id: '1012', vod_name: '孤注一掷', vod_pic: 'https://picsum.photos/seed/m12/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '犯罪' },
  { vod_id: '1013', vod_name: '封神第一部', vod_pic: 'https://picsum.photos/seed/m13/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '奇幻' },
  { vod_id: '1014', vod_name: '八角笼中', vod_pic: 'https://picsum.photos/seed/m14/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '剧情' },
  { vod_id: '1015', vod_name: '长安三万里', vod_pic: 'https://picsum.photos/seed/m15/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '动画' },
  { vod_id: '1016', vod_name: '坚如磐石', vod_pic: 'https://picsum.photos/seed/m16/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '犯罪' },
]

const mockSearchResults = {
  source_a: [
    { vod_id: '1001', vod_name: '流浪地球2', vod_pic: 'https://picsum.photos/seed/m1/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '科幻' },
    { vod_id: '1005', vod_name: '流浪地球', vod_pic: 'https://picsum.photos/seed/m5/300/400', vod_remarks: 'HD', vod_year: '2019', type_name: '科幻' },
  ],
  source_b: [
    { vod_id: '2001', vod_name: '流浪地球2', vod_pic: 'https://picsum.photos/seed/m1b/300/400', vod_remarks: '4K', vod_year: '2023', type_name: '科幻' },
    { vod_id: '2002', vod_name: '流浪地球', vod_pic: 'https://picsum.photos/seed/m5b/300/400', vod_remarks: '4K', vod_year: '2019', type_name: '科幻' },
  ],
  source_c: [
    { vod_id: '3001', vod_name: '流浪地球2', vod_pic: 'https://picsum.photos/seed/m1c/300/400', vod_remarks: 'TS', vod_year: '2023', type_name: '科幻' },
  ],
}

const mockDetail = {
  vod_id: '1001',
  vod_name: '流浪地球2',
  vod_pic: 'https://picsum.photos/seed/m1/600/800',
  vod_remarks: 'HD',
  vod_year: '2023',
  vod_area: '中国大陆',
  type_name: '科幻',
  vod_content: '<p>太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。</p>',
  vod_desc: '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。',
  vod_director: '郭帆',
  vod_actor: '吴京 / 刘德华 / 李雪健 / 沙溢',
  vod_play_from: '量子线路$$$非凡线路$$$闪电线路',
  vod_play_url:
    '流浪地球2$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8$$$流浪地球2$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8$$$流浪地球2$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
}

const mockCategoryVideos = {
  '1': [
    { vod_id: '1001', vod_name: '流浪地球2', vod_pic: 'https://picsum.photos/seed/m1/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '科幻' },
    { vod_id: '1002', vod_name: '满江红', vod_pic: 'https://picsum.photos/seed/m2/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '悬疑' },
    { vod_id: '1006', vod_name: '长津湖', vod_pic: 'https://picsum.photos/seed/m6/300/400', vod_remarks: 'HD', vod_year: '2021', type_name: '战争' },
    { vod_id: '1007', vod_name: '你好，李焕英', vod_pic: 'https://picsum.photos/seed/m7/300/400', vod_remarks: 'HD', vod_year: '2021', type_name: '喜剧' },
    { vod_id: '1009', vod_name: '战狼2', vod_pic: 'https://picsum.photos/seed/m9/300/400', vod_remarks: 'HD', vod_year: '2017', type_name: '动作' },
    { vod_id: '1010', vod_name: '长空之王', vod_pic: 'https://picsum.photos/seed/m10/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '动作' },
    { vod_id: '1011', vod_name: '消失的她', vod_pic: 'https://picsum.photos/seed/m11/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '悬疑' },
    { vod_id: '1012', vod_name: '孤注一掷', vod_pic: 'https://picsum.photos/seed/m12/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '犯罪' },
  ],
  '2': [
    { vod_id: '1003', vod_name: '三体', vod_pic: 'https://picsum.photos/seed/m3/300/400', vod_remarks: '更新至30集', vod_year: '2023', type_name: '科幻' },
    { vod_id: '1004', vod_name: '狂飙', vod_pic: 'https://picsum.photos/seed/m4/300/400', vod_remarks: '全39集', vod_year: '2023', type_name: '犯罪' },
  ],
  '3': [],
  '4': [
    { vod_id: '1008', vod_name: '哪吒之魔童降世', vod_pic: 'https://picsum.photos/seed/m8/300/400', vod_remarks: 'HD', vod_year: '2019', type_name: '动画' },
    { vod_id: '1015', vod_name: '长安三万里', vod_pic: 'https://picsum.photos/seed/m15/300/400', vod_remarks: 'HD', vod_year: '2023', type_name: '动画' },
  ],
  '5': [],
}

export const USE_MOCK = false

export function getMockSources() {
  return mockSources
}

export function getMockCategories() {
  return mockCategories
}

export function getMockHomeVideos() {
  return mockHomeVideos
}

export function getMockSearchResults(keyword) {
  const all = Object.values(mockSearchResults).flat()
  if (!keyword) return all
  return all.filter((v) => v.vod_name.includes(keyword))
}

export function getMockDetail(id) {
  return mockDetail
}

export function getMockCategoryVideos(tid) {
  return mockCategoryVideos[tid] || []
}
