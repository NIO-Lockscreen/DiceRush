#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply all changes to index.html"""

import sys

with open('/home/user/DiceRush/index.html', 'rb') as f:
    data = f.read()

original_size = len(data)
print(f"Original size: {original_size} bytes")

changes_applied = 0

def replace_once(data, old, new, label):
    global changes_applied
    count = data.count(old)
    if count == 0:
        print(f"ERROR: '{label}' - pattern NOT FOUND")
        sys.exit(1)
    if count > 1:
        print(f"WARNING: '{label}' - found {count} times, replacing all")
    result = data.replace(old, new, 1)
    changes_applied += 1
    print(f"OK [{changes_applied}]: {label}")
    return result

# ============================================================
# CHANGE 1: CSS - Add Gambler Wipe Callout styling
# ============================================================
old1 = b'@keyframes badDiceShake{0%,100%{transform:translate(-50%,-50%) rotate(0)}25%{transform:translate(calc(-50% - 7px),-50%) rotate(-1.5deg)}75%{transform:translate(calc(-50% + 7px),-50%) rotate(1.5deg)}}'

new1 = (b'@keyframes badDiceShake{0%,100%{transform:translate(-50%,-50%) rotate(0)}25%{transform:translate(calc(-50% - 7px),-50%) rotate(-1.5deg)}75%{transform:translate(calc(-50% + 7px),-50%) rotate(1.5deg)}}'
        b'\n'
        b'.gamblerWipeCallout{position:fixed;left:50%;top:35%;z-index:73;pointer-events:none;transform:translate(-50%,-50%);width:min(480px,calc(100vw - 24px));padding:20px 22px;border-radius:28px;text-align:center;border:2px solid rgba(255,50,50,.7);background:radial-gradient(circle at 50% 0%,rgba(255,30,30,.35),transparent 40%),radial-gradient(circle at 80% 90%,rgba(180,0,60,.25),transparent 40%),linear-gradient(145deg,rgba(60,5,5,.98),rgba(15,4,4,.97));box-shadow:0 32px 110px rgba(0,0,0,.70),0 0 70px rgba(255,30,30,.38),0 0 140px rgba(255,30,30,.15);animation:wipeBox .28s cubic-bezier(.12,1.2,.2,1) both,wipeShake .12s linear 4 .28s}'
        b'.gamblerWipeEmoji{font-size:52px;margin-bottom:4px;filter:drop-shadow(0 0 22px rgba(255,60,60,.65));animation:wipeEmoji .6s cubic-bezier(.3,1.4,.4,1) both .1s}'
        b'.gamblerWipeKicker{font-size:11px;text-transform:uppercase;letter-spacing:.22em;font-weight:1000;color:#ff9090;margin-bottom:4px}'
        b'.gamblerWipeBig{font-size:clamp(28px,7vw,54px);line-height:.95;font-weight:1000;letter-spacing:-.06em;margin-top:6px;color:#ff4444;text-shadow:0 0 28px rgba(255,50,50,.55)}'
        b'.gamblerWipeSub{margin-top:10px;color:rgba(255,200,200,.88);font-size:14px;font-weight:900;line-height:1.35}'
        b'@keyframes wipeBox{from{opacity:0;transform:translate(-50%,-38%) scale(.72) rotate(-3deg)}to{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}}'
        b'@keyframes wipeShake{0%,100%{transform:translate(-50%,-50%) rotate(0)}25%{transform:translate(calc(-50% - 9px),-50%) rotate(-2.5deg)}75%{transform:translate(calc(-50% + 9px),-50%) rotate(2.5deg)}}'
        b'@keyframes wipeEmoji{from{transform:scale(0) rotate(-45deg)}60%{transform:scale(1.3) rotate(8deg)}to{transform:scale(1) rotate(0)}}')

data = replace_once(data, old1, new1, 'CHANGE 1: CSS Gambler Wipe Callout')

# ============================================================
# CHANGE 2a: Salvage Roller price 100 -> 55
# ============================================================
old2a = b"{id:'salvager', emoji:'\xe2\x99\xbb\xef\xb8\x8f', name:'Salvage Roller', rarity:'uncommon', price:100,"
new2a = b"{id:'salvager', emoji:'\xe2\x99\xbb\xef\xb8\x8f', name:'Salvage Roller', rarity:'uncommon', price:55,"
data = replace_once(data, old2a, new2a, 'CHANGE 2a: Salvage Roller price 100->55')

# ============================================================
# CHANGE 2b: Accountant Cube desc
# ============================================================
old2b = b"desc:'Chance gets +5 score for each dice you own. Scales, but Chance has no target multiplier.'"
new2b = b"desc:'Every bank gets +2 per dice owned. Chance gets a bigger audit: +7 per dice owned. No Chance multiplier, but it helps everywhere.'"
data = replace_once(data, old2b, new2b, 'CHANGE 2b: Accountant Cube desc')

# ============================================================
# CHANGE 2c: Grandma's Purse desc
# ============================================================
old2c = b"desc:'Upper-section banks get +20 before heat. Top-bracket specialist.'"
new2c = b"desc:'Upper-section banks get +20 before heat. She seems modest... but she\xe2\x80\x99s been saving up. Upgrade: she opens wide for those who know when to use her.'"
data = replace_once(data, old2c, new2c, "CHANGE 2c: Grandma's Purse desc")

# ============================================================
# CHANGE 2d: Gambler's Floor desc
# ============================================================
old2d = b"desc:'Your heat floor is permanently 2x, but any Yahtzee busts the banked score to 0. Upgrade: heat floor becomes 3x, Yahtzee still busts score but pays cash.'"
new2d = b"desc:'Your heat floor is permanently 2x, but any Yahtzee wipes your ENTIRE accumulated score to 0. No coming back. Upgrade: heat floor becomes 3x, wipe still happens but pays $100 consolation cash.'"
data = replace_once(data, old2d, new2d, "CHANGE 2d: Gambler's Floor desc")

# ============================================================
# CHANGE 2e: Add 3 new dice to shopItems
# ============================================================
old2e = b"price:67, desc:'Your banked score becomes exactly 67, no matter the row, roll, or heat. Upgrade: rolling a 6 has a 50% chance to turn another die into an impossible 7, and a 7 adds +67 more score.'}"
new2e = (b"price:67, desc:'Your banked score becomes exactly 67, no matter the row, roll, or heat. Upgrade: rolling a 6 has a 50% chance to turn another die into an impossible 7, and a 7 adds +67 more score.'}"
         b",\n"
         b"  {id:'streak', emoji:'\xf0\x9f\x93\x88', name:'Streak Keeper', rarity:'uncommon', price:17, desc:'If this bank\xe2\x80\x99s pre-heat score matches or beats your last scored bank, gain +20 bonus. Upgrade: the reward doubles to +40. Rewards consistent play.'},\n"
         b"  {id:'oddduck', emoji:'\xf0\x9f\xa6\xa4', name:'Odd Duck', rarity:'common', price:12, desc:'Every time you fail a target category (base score is 0), gain +$15 cash. Upgrade: also gains +15 score on top of the cash. Makes misses sting less.'},\n"
         b"  {id:'heattrader', emoji:'\xf0\x9f\x92\xb9', name:'Heat Trader', rarity:'rare', price:28, desc:'If your pre-heat score is under 15, sacrifice the heat multiplier and gain its value x10 as flat bonus score instead. 5x heat -> +50 flat. Upgrade: threshold rises to 25 and the trade pays x14.'}")
data = replace_once(data, old2e, new2e, 'CHANGE 2e: Add 3 new dice to shopItems')

# ============================================================
# CHANGE 3: diceDocs - Add entries for new dice
# ============================================================
old3 = b'"sixtyseven": { detail: "A weird fixed-score dice. It ignores category score and heat, then banks exactly 67 points. It is useful when forced mode hands you a bad row or your roll is trash.", example: "Example: Forced mode wants Sixes, but you roll no 6s. 67 Dice still banks 67. Upgraded: if a rolled 6 creates a 7, the bank becomes 134 instead." }\n};'
new3 = (b'"sixtyseven": { detail: "A weird fixed-score dice. It ignores category score and heat, then banks exactly 67 points. It is useful when forced mode hands you a bad row or your roll is trash.", example: "Example: Forced mode wants Sixes, but you roll no 6s. 67 Dice still banks 67. Upgraded: if a rolled 6 creates a 7, the bank becomes 134 instead." }'
        b',\n'
        b'  "streak": { detail: "A consistency reward dice. It checks the pre-heat score (all bonuses applied, before multiplier) against the last turn you banked. If it is at least as good, you get +20 added before heat.", example: "Example: Last turn you scored 18 pre-heat. This turn you have 20 pre-heat - Streak Keeper fires for +20 before the multiplier." },\n'
        b'  "oddduck": { detail: "A cash consolation dice that fires when the base category score is exactly 0 -- you missed the target pattern entirely. Chance never triggers it since Chance always scores.", example: "Example: Forced mode wants Sixes but you roll no 6s. Base score is 0, so Odd Duck pays +$15. Upgraded, you also gain +15 score." },\n'
        b'  "heattrader": { detail: "An insurance dice. If all bonuses together still leave you under 15 before heat applies, it trades away the heat multiplier and converts it into flat score instead.", example: "Example: Pre-heat score is 8, heat is 4x. Heat Trader trades the 4x for +40 flat, final score is 48 instead of 32." }\n'
        b'};')
data = replace_once(data, old3, new3, 'CHANGE 3: diceDocs new entries')

# ============================================================
# CHANGE 4a: diceUpgradeText - grandma
# ============================================================
old4a = b"grandma:'Grandma vault: upper-section scores get a much bigger pre-heat purse.'"
new4a = b"grandma:'Grandma vault: in Pick mode, she opens wide -- upper-section banks get a massive +80 pre-heat bonus. In Forced mode the purse is smaller (+30), because timing her there is genuinely hard.'"
data = replace_once(data, old4a, new4a, 'CHANGE 4a: diceUpgradeText grandma')

# ============================================================
# CHANGE 4b: diceUpgradeText - gambler
# ============================================================
old4b = b"gambler:'High roller floor: heat floor becomes x3. Yahtzee still busts score to 0, but pays a cash consolation.'"
new4b = b"gambler:'High roller floor: heat floor becomes x3. Yahtzee still wipes your ENTIRE accumulated score to 0, but pays $100 cash consolation.'"
data = replace_once(data, old4b, new4b, 'CHANGE 4b: diceUpgradeText gambler')

# ============================================================
# CHANGE 4c: diceUpgradeText - append new entries before closing
# ============================================================
old4c = b"blackhole:'Event horizon: 30 is apocalyptic; 26+ is still excellent.'"
new4c = (b"blackhole:'Event horizon: 30 is apocalyptic; 26+ is still excellent.'"
         b", streak:'Momentum surge: the consistency reward doubles to +40 pre-heat.'"
         b", oddduck:'Silver lining: missed categories now pay +$25 AND gain +15 score too.'"
         b", heattrader:'Cold trade upgrade: threshold rises to 25 pre-heat and the trade pays x14 flat instead of x10.'")
data = replace_once(data, old4c, new4c, 'CHANGE 4c: diceUpgradeText new entries')

# ============================================================
# CHANGE 5a: smartUpgradePayload - grandma
# ============================================================
old5a = b"    case 'grandma': return cat.section === 'upper' ? {score:40,note:'Grandma Vault upgrade'} : null;"
new5a = b"    case 'grandma': { if (cat.section !== 'upper') return null; const isPick = state.targetMode === 'pick'; return isPick ? {score:80, note:'Grandma Vault: Pick-mode power!'} : {score:30, note:'Grandma Vault upgrade'}; }"
data = replace_once(data, old5a, new5a, 'CHANGE 5a: smartUpgradePayload grandma')

# ============================================================
# CHANGE 5b: smartUpgradePayload - accountant
# ============================================================
old5b = b"    case 'accountant': { const allDice = player.inv.length + (player.invertedInv||[]).length; return catId === 'chance' ? {score:allDice*10,note:'Chief Accountant upgrade'} : {score:allDice*3,note:'Small audit upgrade'}; }"
new5b = b"    case 'accountant': { const allDice = player.inv.length + (player.invertedInv||[]).length; return catId === 'chance' ? {score:allDice*7,note:'Chief Accountant upgrade: Chance bonus'} : {score:allDice*3,note:'Chief Accountant audit upgrade'}; }"
data = replace_once(data, old5b, new5b, 'CHANGE 5b: smartUpgradePayload accountant')

# ============================================================
# CHANGE 5c: smartUpgradePayload - add streak/oddduck/heattrader cases
# ============================================================
old5c = (b"    case 'blackhole': return total === 30 ? {score:1000,money:400,note:'EVENT HORIZON upgrade +1000 +$400'} : (total >= 26 ? {score:180,note:'Deep Gravity upgrade'} : null);\n"
         b"    default: return null;")
new5c = (b"    case 'blackhole': return total === 30 ? {score:1000,money:400,note:'EVENT HORIZON upgrade +1000 +$400'} : (total >= 26 ? {score:180,note:'Deep Gravity upgrade'} : null);\n"
         b"    case 'streak': return null;\n"
         b"    case 'oddduck': return null;\n"
         b"    case 'heattrader': return null;\n"
         b"    default: return null;")
data = replace_once(data, old5c, new5c, 'CHANGE 5c: smartUpgradePayload new cases')

# ============================================================
# CHANGE 6a: effectScore - accountant logic
# ============================================================
old6a = (b"  if (has(player,'accountant') && catId === 'chance') {\n"
         b"    const accountBonus = (player.inv.length + (player.invertedInv||[]).length) * 5;\n"
         b"    addScore('accountant', accountBonus, accountBonus ? `Accountant +${accountBonus}` : '');\n"
         b"  }")
new6a = (b"  if (has(player,'accountant')) {\n"
         b"    const allDice = player.inv.length + (player.invertedInv||[]).length;\n"
         b"    const accountBonus = catId === 'chance' ? allDice * 7 : allDice * 2;\n"
         b"    addScore('accountant', accountBonus, accountBonus ? `Accountant ${catId === 'chance' ? 'full audit' : 'audit'} +${accountBonus}` : '');\n"
         b"  }")
data = replace_once(data, old6a, new6a, 'CHANGE 6a: effectScore accountant logic')

# ============================================================
# CHANGE 6b: effectScore - add Odd Duck after Grandma's Purse
# ============================================================
old6b = (b"  if (has(player,'grandma') && cat.section === 'upper') addScore('grandma', 20, 'Grandma\xe2\x80\x99s Purse +20');\n"
         b"  if (has(player,'microwave') && total % 2 === 0) addScore('microwave', 16, 'Angry Microwave +16');")
new6b = (b"  if (has(player,'grandma') && cat.section === 'upper') addScore('grandma', 20, 'Grandma\xe2\x80\x99s Purse +20');\n"
         b"  if (has(player,'oddduck') && categoryScore === 0 && catId !== 'chance') {\n"
         b"    const duckCash = isUpgraded(player,'oddduck') ? 25 : 15;\n"
         b"    const duckScore = isUpgraded(player,'oddduck') ? 15 : 0;\n"
         b"    addMoney('oddduck', duckCash, `Odd Duck consolation +$${duckCash}`);\n"
         b"    if (duckScore) addScore('oddduck', duckScore, `Odd Duck score consolation +${duckScore}`);\n"
         b"  }\n"
         b"  if (has(player,'microwave') && total % 2 === 0) addScore('microwave', 16, 'Angry Microwave +16');")
data = replace_once(data, old6b, new6b, 'CHANGE 6b: effectScore Odd Duck logic')

# ============================================================
# CHANGE 6c: effectScore - add Streak Keeper before smart upgrade loop
# ============================================================
old6c = (b"  // Smart upgrades: every upgraded dice gains a stronger, theme-aware payoff before heat.\n"
         b"  for (const id of [...new Set([...(player.inv || []), ...(player.invertedInv || [])])])")
new6c = (b"  // Streak Keeper: fires if pre-heat score beats or ties last turn\n"
         b"  if (has(player,'streak')) {\n"
         b"    const lastScore = player.lastTurn ? (player.lastTurn.score || 0) : 0;\n"
         b"    if (currentRawScore() >= lastScore) {\n"
         b"      const streakBonus = isUpgraded(player,'streak') ? 40 : 20;\n"
         b"      addScore('streak', streakBonus, `Streak Keeper: \xe2\x89\xa5${lastScore} \xe2\x86\x92 +${streakBonus}`);\n"
         b"    }\n"
         b"  }\n"
         b"\n"
         b"  // Smart upgrades: every upgraded dice gains a stronger, theme-aware payoff before heat.\n"
         b"  for (const id of [...new Set([...(player.inv || []), ...(player.invertedInv || [])])])")
data = replace_once(data, old6c, new6c, 'CHANGE 6c: effectScore Streak Keeper')

# ============================================================
# CHANGE 6d: effectScore - Heat Trader between preMultiplierScore and Dragon check
# ============================================================
old6d = (b"  let preMultiplierScore = categoryScore + diceScore;\n"
         b"  if (has(player,'dragon') && (preMultiplierScore * targetBoost.multiplier) >= 60) {")
new6d = (b"  let preMultiplierScore = categoryScore + diceScore;\n"
         b"\n"
         b"  // Heat Trader: if pre-heat score is low, sacrifice heat multiplier for flat score\n"
         b"  if (has(player,'heattrader') && targetBoost.multiplier > 1) {\n"
         b"    const threshold = isUpgraded(player,'heattrader') ? 25 : 15;\n"
         b"    const payRate = isUpgraded(player,'heattrader') ? 14 : 10;\n"
         b"    if (preMultiplierScore < threshold) {\n"
         b"      const tradeBonus = targetBoost.multiplier * payRate;\n"
         b"      diceScore += tradeBonus;\n"
         b"      preMultiplierScore = categoryScore + diceScore;\n"
         b"      markUsed('heattrader', `Heat Trader: sacrificed ${targetBoost.multiplier}x heat for +${tradeBonus} flat score`);\n"
         b"      targetBoost = { multiplier: 1, reason: 'Heat Trader sacrificed heat for flat score' };\n"
         b"    }\n"
         b"  }\n"
         b"\n"
         b"  if (has(player,'dragon') && (preMultiplierScore * targetBoost.multiplier) >= 60) {")
data = replace_once(data, old6d, new6d, 'CHANGE 6d: effectScore Heat Trader')

# ============================================================
# CHANGE 6e: effectScore - gambler bust with gamblerTotalWipe flag
# ============================================================
old6e = (b"  if (has(player,'gambler') && isYahtzee(dice)) {\n"
         b"    score = 0;\n"
         b"    if (isUpgraded(player,'gambler')) addMoney('gambler', preview ? 0 : 100, 'High Roller bust consolation +$100');\n"
         b"    markUsed('gambler', isUpgraded(player,'gambler') ? 'High Roller bust: Yahtzee score set to 0, +$100' : 'Gambler bust: Yahtzee score set to 0');\n"
         b"  }\n"
         b"\n"
         b"  return { score, money, notes, dice, usedItems, targetMultiplier: targetBoost.multiplier, diceBonus: diceScore, categoryScore, preMultiplierScore, multipliedScore, wogPenaltyLost };")
new6e = (b"  let gamblerTotalWipe = false;\n"
         b"  if (has(player,'gambler') && isYahtzee(dice)) {\n"
         b"    score = 0;\n"
         b"    gamblerTotalWipe = !preview;\n"
         b"    if (isUpgraded(player,'gambler')) addMoney('gambler', preview ? 0 : 100, 'High Roller bust consolation +$100');\n"
         b"    markUsed('gambler', isUpgraded(player,'gambler') ? 'High Roller TOTAL WIPE: Yahtzee erased all score, +$100' : 'Gambler TOTAL WIPE: Yahtzee erased all accumulated score');\n"
         b"  }\n"
         b"\n"
         b"  return { score, money, notes, dice, usedItems, targetMultiplier: targetBoost.multiplier, diceBonus: diceScore, categoryScore, preMultiplierScore, multipliedScore, wogPenaltyLost, gamblerTotalWipe };")
data = replace_once(data, old6e, new6e, 'CHANGE 6e: effectScore gamblerTotalWipe flag')

# ============================================================
# CHANGE 7: Add showGamblerWipeCallout function after showBadDiceCallout
# ============================================================
old7 = (b"function showBadDiceCallout(amount){\n"
        b"  if (!amount) return;\n"
        b"  document.querySelectorAll('.badDiceCallout').forEach(el => el.remove());\n"
        b"  const box = document.createElement('div');\n"
        b"  box.className = 'badDiceCallout';\n"
        b"  box.innerHTML = `<div class=\"badDiceEmoji\">\xf0\x9f\xaa\xa6</div><div class=\"badDiceKicker\">Bad dice activated</div><div class=\"badDiceBig\">-${amount} points</div><div class=\"badDiceCopy\">WOG stole ${amount} point${amount===1?'':'s'} from this bank.</div>`;\n"
        b"  document.body.appendChild(box);\n"
        b"  setTimeout(()=>{ box.style.transition='opacity .34s ease, transform .34s ease'; box.style.opacity='0'; box.style.transform='translate(-50%,-62%) scale(.94)'; }, 1650);\n"
        b"  setTimeout(()=>box.remove(), 2100);\n"
        b"}")
new7 = (b"function showBadDiceCallout(amount){\n"
        b"  if (!amount) return;\n"
        b"  document.querySelectorAll('.badDiceCallout').forEach(el => el.remove());\n"
        b"  const box = document.createElement('div');\n"
        b"  box.className = 'badDiceCallout';\n"
        b"  box.innerHTML = `<div class=\"badDiceEmoji\">\xf0\x9f\xaa\xa6</div><div class=\"badDiceKicker\">Bad dice activated</div><div class=\"badDiceBig\">-${amount} points</div><div class=\"badDiceCopy\">WOG stole ${amount} point${amount===1?'':'s'} from this bank.</div>`;\n"
        b"  document.body.appendChild(box);\n"
        b"  setTimeout(()=>{ box.style.transition='opacity .34s ease, transform .34s ease'; box.style.opacity='0'; box.style.transform='translate(-50%,-62%) scale(.94)'; }, 1650);\n"
        b"  setTimeout(()=>box.remove(), 2100);\n"
        b"}\n"
        b"\n"
        b"function showGamblerWipeCallout(isUpg){\n"
        b"  document.querySelectorAll('.gamblerWipeCallout').forEach(el => el.remove());\n"
        b"  const box = document.createElement('div');\n"
        b"  box.className = 'gamblerWipeCallout';\n"
        b"  box.innerHTML = `<div class=\"gamblerWipeEmoji\">\xf0\x9f\x92\x80</div><div class=\"gamblerWipeKicker\">\xf0\x9f\x8e\xb2 Gambler\xe2\x80\x99s Floor \xe2\x80\x94 Yahtzee!</div><div class=\"gamblerWipeBig\">EVERYTHING WIPED</div><div class=\"gamblerWipeSub\">Your Yahtzee erased every point you\xe2\x80\x99ve earned this game.${isUpg ? '<br>\xf0\x9f\x92\xb8 +$100 consolation cash.' : '<br>No coming back.'}</div>`;\n"
        b"  document.body.appendChild(box);\n"
        b"  vibrate([80,40,120,40,200]);\n"
        b"  [110,165,82].forEach((f,i) => tone(f,.22,'sawtooth',.09,i*.06));\n"
        b"  setTimeout(()=>{ box.style.transition='opacity .5s ease, transform .5s ease'; box.style.opacity='0'; box.style.transform='translate(-50%,-64%) scale(.93)'; }, 3500);\n"
        b"  setTimeout(()=>box.remove(), 4100);\n"
        b"}")
data = replace_once(data, old7, new7, 'CHANGE 7: showGamblerWipeCallout function')

# ============================================================
# CHANGE 8: scoreTarget - handle total score wipe
# ============================================================
# First part: replace the scoring block to add gamblerTotalWipe wipe logic
old8a = (b"  player.scores[catId] = score;\n"
         b"  const baseCash = score > 0 ? Math.max(14, Math.floor(score*.75) + 8) : 0;\n"
         b"  const earned = baseCash + result.money;\n"
         b"  player.cash += earned;\n"
         b"  player.lastTurn = { catId, name: findCategory(catId).name, score, earned };")
new8a = (b"  player.scores[catId] = score;\n"
         b"\n"
         b"  // Gambler's Floor total wipe: a Yahtzee nukes ALL accumulated score\n"
         b"  if (result.gamblerTotalWipe) {\n"
         b"    Object.keys(player.scores).forEach(key => { player.scores[key] = 0; });\n"
         b"    player.yahtzeeBonus = 0;\n"
         b"    player.scoreSwapAdjust = 0;\n"
         b"    result.notes = result.notes.filter(n => !n.startsWith('Extra Yahtzee'));\n"
         b"    result.notes.push('\xf0\x9f\x92\x80 Gambler total wipe: all scores erased');\n"
         b"  }\n"
         b"\n"
         b"  const baseCash = score > 0 ? Math.max(14, Math.floor(score*.75) + 8) : 0;\n"
         b"  const earned = baseCash + result.money;\n"
         b"  player.cash += earned;\n"
         b"  player.lastTurn = { catId, name: findCategory(catId).name, score, earned };")
data = replace_once(data, old8a, new8a, 'CHANGE 8a: scoreTarget gamblerTotalWipe score wipe')

# Second part: insert gamblerTotalWipe callout BEFORE wogPenaltyLost block
old8b = (b"  if (result.wogPenaltyLost) {\n"
         b"    setTimeout(()=>{ sfx.bad(); showBadDiceCallout(result.wogPenaltyLost); vibrate([80,30,80]); }, 120);\n"
         b"  }")
new8b = (b"  if (result.gamblerTotalWipe) {\n"
         b"    setTimeout(()=>{ showGamblerWipeCallout(isUpgraded(player,'gambler')); }, 180);\n"
         b"  }\n"
         b"  if (result.wogPenaltyLost) {\n"
         b"    setTimeout(()=>{ sfx.bad(); showBadDiceCallout(result.wogPenaltyLost); vibrate([80,30,80]); }, 120);\n"
         b"  }")
data = replace_once(data, old8b, new8b, 'CHANGE 8b: scoreTarget gamblerTotalWipe callout')

# ============================================================
# Write the result
# ============================================================
with open('/home/user/DiceRush/index.html', 'wb') as f:
    f.write(data)

print(f"\nAll {changes_applied} changes applied successfully!")
print(f"New size: {len(data)} bytes (was {original_size})")
