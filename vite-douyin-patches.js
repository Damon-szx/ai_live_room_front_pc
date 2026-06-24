/**
 * Build-time patches for dycast (do not edit ../dycast source).
 */

const PARSE_LIVE_MODERN_HELPER = `function pickDouyinInternalRoomId(html: string, webRid: string, legacyRoomId = '') {
  const fromLegacy = legacyRoomId && legacyRoomId.length >= 16 ? legacyRoomId : '';
  const fromHtml =
    html.match(/roomId\\\\":\\\\"(\\d{16,19})/)?.[1] ||
    html.match(/"roomId":"(\\d{16,19})"/)?.[1] ||
    '';
  return fromHtml || fromLegacy || webRid;
}

function parseLiveHtmlModern(html: string): DyLiveInfo | null {
  try {
    const liveStatus =
      html.match(/liveStatus\\\\":\\\\"([^\\\\]+)/)?.[1] ||
      html.match(/"liveStatus":"([^"]+)"/)?.[1] ||
      '';
    const uniqueId =
      html.match(/user_unique_id\\\\":\\\\"(\\d+)/)?.[1] ||
      html.match(/"user_unique_id":"(\\d+)"/)?.[1] ||
      '';
    const webRid =
      html.match(/web_rid\\\\":\\\\"(\\d{6,15})/)?.[1] ||
      html.match(/"webrid":"(\\d{6,15})"/)?.[1] ||
      html.match(/live\\.douyin\\.com\\/(\\d{6,15})/)?.[1] ||
      '';
    if (!uniqueId || !webRid) return null;
    let status = 4;
    if (liveStatus === 'normal') status = 2;
    else if (liveStatus === 'pause') status = 3;
    else if (!liveStatus) status = 2;
    const nickname =
      html.match(/nickname\\\\":\\\\"([^\\\\]+)/)?.[1] ||
      html.match(/"nickname":"([^"]+)"/)?.[1] ||
      '';
    const title =
      html.match(/"title":"([^"\\\\]+)/)?.[1] ||
      html.match(/title\\\\":\\\\"([^\\\\]+)/)?.[1] ||
      '';
    return {
      roomId: pickDouyinInternalRoomId(html, webRid),
      uniqueId,
      avatar: '',
      cover: '',
      nickname,
      title,
      status
    };
  } catch {
    return null;
  }
}

`;

const PARSE_LIVE_INSERT_HELPER_FROM = `/**
 * 解析直播间信息
 * @param html
 * @returns
 */
export const parseLiveHtml = function (html: string): DyLiveInfo | null {`;

const PARSE_LIVE_INSERT_HELPER_TO = `${PARSE_LIVE_MODERN_HELPER}/**
 * 解析直播间信息
 * @param html
 * @returns
 */
export const parseLiveHtml = function (html: string): DyLiveInfo | null {`;

const PARSE_LIVE_NO_MATCH_FROM = `    if (!matchRes) return null;`;

const PARSE_LIVE_NO_MATCH_TO = `    if (!matchRes) return parseLiveHtmlModern(html);`;

const PARSE_LIVE_CATCH_FROM = `  } catch (err) {
    return null;
  }
};

/**
 * 将对象化成请求参数字符串`;

const PARSE_LIVE_CATCH_TO = `  } catch (err) {
    return parseLiveHtmlModern(html);
  }
};

/**
 * 将对象化成请求参数字符串`;

const PARSE_LIVE_STATUS_PATCH_FROM = `    const status = extractJsonField('status', json);
    return {
      roomId,
      uniqueId,
      avatar: decodeUnicodeUrl(avatar),
      cover: decodeUnicodeUrl(cover),
      nickname,
      title,
      status: parseInt(status || '4')
    };`;

const PARSE_LIVE_STATUS_PATCH_TO = `    let status = extractJsonField('status', json);
    const liveStatus =
      json.match(/"liveStatus":"([^"]+)"/)?.[1] ||
      json.match(/liveStatus\\\\":\\\\"([^\\\\]+)/)?.[1] ||
      '';
    const webRid =
      json.match(/"web_rid":"(\\d+)"/)?.[1] ||
      json.match(/web_rid\\\\":\\\\"(\\d{6,15})/)?.[1] ||
      '';
    if (!status) {
      if (liveStatus === 'normal') status = '2';
      else if (liveStatus === 'pause') status = '3';
      else if (liveStatus === 'end') status = '4';
    }
    const internalRoomId =
      (roomId && roomId.length >= 16 ? roomId : '') ||
      json.match(/roomId\\\\":\\\\"(\\d{16,19})/)?.[1] ||
      '';
    const resolvedRoomId = internalRoomId || webRid || roomId;
    return {
      roomId: resolvedRoomId,
      uniqueId,
      avatar: decodeUnicodeUrl(avatar),
      cover: decodeUnicodeUrl(cover),
      nickname,
      title,
      status: parseInt(status || (liveStatus === 'normal' ? '2' : '4'))
    };`;

export function patchParseLiveHtml(code) {
  let next = code;
  if (next.includes(PARSE_LIVE_INSERT_HELPER_FROM) && !next.includes("parseLiveHtmlModern")) {
    next = next.replace(PARSE_LIVE_INSERT_HELPER_FROM, PARSE_LIVE_INSERT_HELPER_TO);
  }
  if (next.includes(PARSE_LIVE_NO_MATCH_FROM)) {
    next = next.replace(PARSE_LIVE_NO_MATCH_FROM, PARSE_LIVE_NO_MATCH_TO);
  }
  if (next.includes(PARSE_LIVE_CATCH_FROM)) {
    next = next.replace(PARSE_LIVE_CATCH_FROM, PARSE_LIVE_CATCH_TO);
  }
  if (next.includes(PARSE_LIVE_STATUS_PATCH_FROM)) {
    next = next.replace(PARSE_LIVE_STATUS_PATCH_FROM, PARSE_LIVE_STATUS_PATCH_TO);
  }
  return next;
}

export function patchSocketUrl(code) {
  // 始终走 /socket 反代，确保 sessionid Cookie 随 WS 握手转发；勿用 pushServer 直连外网。
  return code;
}

const FETCH_CONNECT_PATCH_FROM = `      const info = await getLiveInfo(roomNum);
      this.info = info;
      this.status = info.status;
      await fetchUser();
      const res = await getImInfo(info.roomId, info.uniqueId);`;

const FETCH_CONNECT_PATCH_TO = `      await getLiveInfo(roomNum);
      const info = await getLiveInfo(roomNum);
      this.info = info;
      this.status = info.status;
      await fetchUser();
      const res = await getImInfo(info.roomId, info.uniqueId, roomNum);`;

const FETCH_CONNECT_IM_PATCH_FROM = `const res = await getImInfo(info.roomId, info.uniqueId);`;
const FETCH_CONNECT_IM_PATCH_TO = `const res = await getImInfo(info.roomId, info.uniqueId, roomNum);`;

export function patchFetchConnectInfo(code) {
  let next = code;
  if (next.includes(FETCH_CONNECT_PATCH_FROM)) {
    next = next.replace(FETCH_CONNECT_PATCH_FROM, FETCH_CONNECT_PATCH_TO);
  } else if (
    next.includes(FETCH_CONNECT_IM_PATCH_FROM) &&
    !next.includes("getImInfo(info.roomId, info.uniqueId, roomNum)")
  ) {
    next = next.replace(FETCH_CONNECT_IM_PATCH_FROM, FETCH_CONNECT_IM_PATCH_TO);
  }
  return next;
}

const CHAT_RTF_PATCH_FROM = `        case CastMethod.CHAT:
          message = decodeChatMessage(payload);
          data.method = CastMethod.CHAT;
          data.user = this._getCastUser(message.user);
          data.content = message.content;
          // 获取富文本：包含合并表情
          data.rtfContent = this._getCastRtfContent(message.rtfContentV2);
          break;`;

const CHAT_RTF_PATCH_TO = `        case CastMethod.CHAT:
          message = decodeChatMessage(payload);
          data.method = CastMethod.CHAT;
          data.user = this._getCastUser(message.user);
          data.content = message.content;
          // 历史弹幕常带 content；实时弹幕有时只带 rtfContent(v1) 或 rtfContentV2。
          data.rtfContent =
            this._getCastRtfContent(message.rtfContentV2) ||
            this._getCastRtfContent(message.rtfContent);
          if (!data.content && data.rtfContent?.length) {
            data.content = data.rtfContent
              .map((item) => String(item?.text || '').trim())
              .filter(Boolean)
              .join('');
          }
          break;`;

export function patchChatRtfContent(code) {
  if (!code.includes(CHAT_RTF_PATCH_FROM)) {
    return code;
  }
  return code.replace(CHAT_RTF_PATCH_FROM, CHAT_RTF_PATCH_TO);
}

const FETCH_IM_INFO_PATCH_FROM = `export const fetchImInfo = async function (roomId: string, uniqueId: string) {`;
const FETCH_IM_INFO_PATCH_TO = `export const fetchImInfo = async function (roomId: string, uniqueId: string, livePc?: string) {`;

const FETCH_IM_LIVE_PC_PARAM_FROM = `        live_pc: roomId
      })
    );
    // 一个加密参数，须通过上侧 params 参数计算，感兴趣自己去逆向，这里不解析，不一定验证
    // const aBogus = '00000000';
    const aBogus = getAbogus(paramStr, USER_AGENT);
    Object.assign(params, {
      live_pc: roomId,`;

const FETCH_IM_LIVE_PC_PARAM_TO = `        live_pc: livePc || roomId
      })
    );
    // 一个加密参数，须通过上侧 params 参数计算，感兴趣自己去逆向，这里不解析，不一定验证
    // const aBogus = '00000000';
    const aBogus = getAbogus(paramStr, USER_AGENT);
    Object.assign(params, {
      live_pc: livePc || roomId,`;

const GET_IM_INFO_PATCH_FROM = `export const getImInfo = async function (roomId: string, uniqueId: string): Promise<DyImInfo> {
  const reqMs = Date.now();
  try {
    const buffer = await fetchImInfo(roomId, uniqueId);`;

const GET_IM_INFO_PATCH_TO = `export const getImInfo = async function (roomId: string, uniqueId: string, livePc?: string): Promise<DyImInfo> {
  const reqMs = Date.now();
  try {
    const buffer = await fetchImInfo(roomId, uniqueId, livePc);`;

export function patchFetchImInfo(code) {
  let next = code;
  if (next.includes(FETCH_IM_INFO_PATCH_FROM)) {
    next = next.replace(FETCH_IM_INFO_PATCH_FROM, FETCH_IM_INFO_PATCH_TO);
  }
  if (next.includes(FETCH_IM_LIVE_PC_PARAM_FROM)) {
    next = next.replace(FETCH_IM_LIVE_PC_PARAM_FROM, FETCH_IM_LIVE_PC_PARAM_TO);
  }
  if (next.includes(GET_IM_INFO_PATCH_FROM)) {
    next = next.replace(GET_IM_INFO_PATCH_FROM, GET_IM_INFO_PATCH_TO);
  }
  return next;
}
