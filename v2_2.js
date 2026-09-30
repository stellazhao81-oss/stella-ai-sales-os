/* =========================================================
   Stella AI Sales OS V2.2
   Follow-up Cadence + Professional Outreach Engine

   Cold outreach cadence:
   Touch 1: Initial outreach
   -> follow up after 3 BUSINESS DAYS

   Touch 2: First follow-up
   -> follow up after 5 BUSINESS DAYS

   Touch 3: Second follow-up
   -> follow up after 7 CALENDAR DAYS

   Touch 4+:
   -> follow up every 7 CALENDAR DAYS

   Saturday / Sunday are NEVER recommended follow-up days.
   Weekend dates automatically move to Monday.
========================================================= */

(function () {

  /* =====================================================
     1. DATE HELPERS
  ===================================================== */

  function v22Today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function v22ParseDate(dateStr) {
    if (!dateStr) return new Date();
    return new Date(dateStr + "T12:00:00");
  }

  function v22FormatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function v22MoveWeekendToMonday(date) {
    const d = new Date(date);

    // Sunday
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + 1);
    }

    // Saturday
    if (d.getDay() === 6) {
      d.setDate(d.getDate() + 2);
    }

    return d;
  }

  function v22AddBusinessDays(dateStr, days) {
    const d = v22ParseDate(dateStr);
    let added = 0;

    while (added < days) {
      d.setDate(d.getDate() + 1);

      const dow = d.getDay();

      if (dow !== 0 && dow !== 6) {
        added++;
      }
    }

    return v22FormatDate(d);
  }

  function v22AddCalendarDays(dateStr, days) {
    const d = v22ParseDate(dateStr);

    d.setDate(d.getDate() + days);

    return v22FormatDate(
      v22MoveWeekendToMonday(d)
    );
  }

  function v22NormalizeFollowupDate(dateStr) {
    if (!dateStr) return "";

    return v22FormatDate(
      v22MoveWeekendToMonday(
        v22ParseDate(dateStr)
      )
    );
  }


  /* =====================================================
     2. FOLLOW-UP ROUND
  ===================================================== */

  function v22Round(c) {

    let round = Number(
      c.followupRound ??
      c.followup_round ??
      0
    );

    if (!Number.isFinite(round)) {
      round = 0;
    }

    /*
      Existing cold-development customers that already
      have a last-contact date have at least received
      the first outreach.
    */
    if (
      round === 0 &&
      c.lastContact &&
      ["Developing", "Waiting Reply"].includes(c.status)
    ) {
      round = 1;
    }

    return round;
  }


  function v22RoundLabel(c) {

    const round = v22Round(c);

    if (round === 0) {
      return "Initial outreach not recorded";
    }

    if (round === 1) {
      return "Initial outreach sent";
    }

    if (round === 2) {
      return "Follow-up #1 sent";
    }

    if (round === 3) {
      return "Follow-up #2 sent";
    }

    if (round === 4) {
      return "Follow-up #3 sent";
    }

    return `Weekly follow-up #${round - 3}`;
  }


  /*
    The argument is the NEW round after today's touch.

    Round 1:
      initial email sent -> +3 business days

    Round 2:
      first follow-up sent -> +5 business days

    Round 3:
      second follow-up sent -> +7 calendar days

    Round 4+:
      weekly follow-up -> +7 calendar days
  */
  function v22NextDateAfterTouch(round, baseDate) {

    const base = baseDate || v22Today();

    if (round <= 1) {
      return v22AddBusinessDays(base, 3);
    }

    if (round === 2) {
      return v22AddBusinessDays(base, 5);
    }

    return v22AddCalendarDays(base, 7);
  }


  /* =====================================================
     3. CLOUD MAPPING
     Persist followup_round to Supabase
  ===================================================== */

  if (typeof fromCloud === "function") {

    fromCloud = function (r) {

      return {
        id: r.id,

        company: r.company || "",
        contact: r.contact || "",
        country: r.country || "",
        role: r.role || "",

        source: r.source || "",
        product: r.product || "",

        status: r.status || "Developing",
        priority: r.priority || "B",

        lastContact:
          r.last_contact || "",

        nextFollowup:
          v22NormalizeFollowupDate(
            r.next_followup || ""
          ),

        blocker: r.blocker || "",
        notes: r.notes || "",

        followupRound:
          Number(r.followup_round || 0),

        tags: r.tags || []
      };
    };
  }


  if (typeof toCloud === "function") {

    toCloud = function (c) {

      return {
        id: c.id,

        user_id:
          typeof currentUser !== "undefined" &&
          currentUser
            ? currentUser.id
            : null,

        company: c.company || "",
        contact: c.contact || "",
        country: c.country || "",
        role: c.role || "",

        source: c.source || "",
        product: c.product || "",

        status: c.status || "Developing",
        priority: c.priority || "B",

        last_contact:
          c.lastContact || null,

        next_followup:
          c.nextFollowup
            ? v22NormalizeFollowupDate(
                c.nextFollowup
              )
            : null,

        blocker: c.blocker || "",
        notes: c.notes || "",

        followup_round:
          v22Round(c)
      };
    };
  }


  /* =====================================================
     4. CUSTOMER-SAFE TEXT HELPERS
  ===================================================== */

  function v22FirstName(c) {

    if (!c.contact) return "";

    return String(c.contact)
      .trim()
      .split(/\s+/)[0];
  }


  function v22Greeting(c) {

    const first = v22FirstName(c);

    return first
      ? `Hi ${first},`
      : "Hi,";
  }


  function v22Product(c) {

    const p = String(c.product || "").trim();

    if (!p) {
      return "our stone materials";
    }

    return p;
  }


  /* =====================================================
     5. INTERNAL SALES ANALYSIS
  ===================================================== */

  nextStep = function (c) {

    const round = v22Round(c);

    let nextDate =
      c.nextFollowup
        ? v22NormalizeFollowupDate(
            c.nextFollowup
          )
        : "";

    if (!nextDate && c.lastContact) {
      nextDate =
        v22NextDateAfterTouch(
          Math.max(round, 1),
          c.lastContact
        );
    }


    if (c.status === "Project") {

      return {
        action:
          "推进一个项目关键确认点",

        reason:
          "不要一次问太多。优先确认尺寸、材料、数量、审批或项目时间中的一个关键变量。",

        judgement:
          "这是项目型客户，应围绕项目真实进度推进，而不是机械催回复。",

        channel:
          c.source || "Email",

        nextDate:
          nextDate ||
          v22AddBusinessDays(
            v22Today(),
            2
          )
      };
    }


    if (c.status === "Quoted") {

      return {
        action:
          "确认报价后的真实卡点",

        reason:
          "不要重复发送报价，也不要先主动降价。先判断客户卡在价格、运输、规格、审批还是项目时间。",

        judgement:
          "客户已经进入报价阶段，现在的目标是识别成交障碍。",

        channel:
          c.source || "Email",

        nextDate:
          nextDate ||
          v22AddBusinessDays(
            v22Today(),
            3
          )
      };
    }


    if (c.status === "Sample") {

      return {
        action:
          "推进样品的下一个节点",

        reason:
          "围绕样品准备、运费、寄出、签收或评价中的下一步推进。",

        judgement:
          "样品客户已经投入实际时间，应优先保持连续推进。",

        channel:
          c.source || "Email",

        nextDate:
          nextDate ||
          v22AddBusinessDays(
            v22Today(),
            3
          )
      };
    }


    if (c.status === "Replied") {

      return {
        action:
          "确认 1–2 个真正影响下一步的问题",

        reason:
          "客户已经回复，不需要再次介绍公司。应尽快确认应用、数量、规格或采购方式。",

        judgement:
          "已有互动客户的重点是从聊天进入明确需求。",

        channel:
          c.source || "Email",

        nextDate:
          nextDate ||
          v22AddBusinessDays(
            v22Today(),
            2
          )
      };
    }


    if (c.status === "Nurture") {

      return {
        action:
          "低频价值培育",

        reason:
          "只在有新的产品、项目案例、价格优势或市场信息时联系，不高频催促。",

        judgement:
          "当前不是短期成交客户，应控制时间投入。",

        channel:
          c.source || "Email",

        nextDate:
          nextDate ||
          v22AddCalendarDays(
            v22Today(),
            7
          )
      };
    }


    if (
      c.status === "Developing" ||
      c.status === "Waiting Reply"
    ) {

      let action = "";
      let reason = "";

      if (round === 0) {

        action =
          "发送第一次精准开发信息";

        reason =
          "先证明相关性，不急着发完整目录，也不要一次问很多问题。";

      } else if (round === 1) {

        action =
          "第一次跟进：提供一个新的价值点";

        reason =
          "首封邮件之后间隔 3 个工作日；不要只问 Any update?。";

      } else if (round === 2) {

        action =
          "第二次跟进：降低回复门槛";

        reason =
          "上一封跟进后间隔 5 个工作日；让客户只需要回答一个简单问题。";

      } else if (round === 3) {

        action =
          "第三次跟进：确认项目或采购是否仍然相关";

        reason =
          "距离上一封间隔 7 天；保持低压力，不逼客户做决定。";

      } else {

        action =
          "每周一次价值型培育";

        reason =
          "连续没有回复后，每 7 天一次；每次必须有新的理由，不重复上一封内容。";
      }


      return {
        action,
        reason,

        judgement:
          "这是自主开发客户，重点是持续建立相关性并逐步确认采购模式。",

        channel:
          c.source || "Email",

        nextDate:
          nextDate ||
          (
            round === 0
              ? ""
              : v22NextDateAfterTouch(
                  round,
                  c.lastContact || v22Today()
                )
          )
      };
    }


    return {
      action:
        "根据最新客户记录推进一个小动作",

      reason:
        "避免泛泛催促，每次只推进一个明确下一步。",

      judgement:
        "根据客户当前阶段进行低压力推进。",

      channel:
        c.source || "Email",

      nextDate:
        nextDate ||
        v22AddBusinessDays(
          v22Today(),
          3
        )
    };
  };


  /* =====================================================
     6. PROFESSIONAL CUSTOMER-FACING COPY
     ENGLISH ONLY
  ===================================================== */

  function v22ColdEmail(c) {

    const round = v22Round(c);
    const hello = v22Greeting(c);
    const product = v22Product(c);


    if (round === 0) {

      return `${hello}

I came across your company while researching businesses working with stone and surface materials.

We supply ${product} for distributors, fabricators and project applications.

Rather than sending you a full catalogue, may I ask whether this material category is relevant to what you currently source?

If so, I can send a small selection of the most suitable options for a quick review.

Best regards,
Stella`;
    }


    if (round === 1) {

      return `${hello}

I wanted to follow up on my earlier message with one additional point.

Rather than sending a large catalogue, I can narrow the ${product} range down to just a few options that are more relevant for distribution or project use.

If this category is relevant to your business, I can send 3–4 options with the key sizes and specifications for a quick comparison.

Best regards,
Stella`;
    }


    if (round === 2) {

      return `${hello}

Just one practical follow-up from my side.

If ${product} is a category you currently source, I can prepare a short comparison covering the main sizes, thicknesses and lead time instead of sending more general product information.

Would that be useful for you?

Best regards,
Stella`;
    }


    if (round === 3) {

      return `${hello}

I’ll keep this brief.

If ${product} is still relevant to any current or upcoming requirement, just send me the application or approximate quantity and I can narrow down the most practical option for you.

If it is not a current priority, no problem at all.

Best regards,
Stella`;
    }


    return `${hello}

A quick update from my side rather than repeating my previous messages.

We are continuing to supply ${product} for distributor and project requirements.

If you have anything active at the moment, feel free to send me the basic specification or quantity and I’ll check the closest suitable option for you.

Best regards,
Stella`;
  }


  function v22QuotedEmail(c) {

    return `${v22Greeting(c)}

I was reviewing the quotation we prepared for you and wanted to check one point rather than simply resend the same information.

Is the main point you are comparing right now the product cost, freight, specification, or project timing?

Once I know that, I can focus on the part that is actually relevant to your decision.

Best regards,
Stella`;
  }


  function v22ProjectEmail(c) {

    return `${v22Greeting(c)}

I was reviewing the project information again.

To keep the next step simple, could you let me know which item is still pending on your side — final specification, quantity, material approval, or project timing?

Once that point is clear, I can prepare the next step accordingly.

Best regards,
Stella`;
  }


  function v22SampleEmail(c) {

    return `${v22Greeting(c)}

Just checking the sample stage.

Is there anything still needed from my side for the sample shipment or evaluation?

If everything is already in hand, I’m happy to give you time to review it and follow up afterwards.

Best regards,
Stella`;
  }


  function v22RepliedEmail(c) {

    return `${v22Greeting(c)}

Thanks again for your reply.

To make the next step useful, could you confirm the main application and the approximate quantity you are considering?

Once I have those two points, I can narrow down the suitable option instead of sending unnecessary information.

Best regards,
Stella`;
  }


  function v22NurtureEmail(c) {

    return `${v22Greeting(c)}

I wanted to share a quick update rather than send another general introduction.

We have recently been working on several ${v22Product(c)} options for distributor and project applications.

If this category becomes relevant to any upcoming requirement, I’d be happy to send only the options that fit the project.

Best regards,
Stella`;
  }


  function v22EmailDraft(c) {

    if (c.status === "Quoted") {
      return v22QuotedEmail(c);
    }

    if (c.status === "Project") {
      return v22ProjectEmail(c);
    }

    if (c.status === "Sample") {
      return v22SampleEmail(c);
    }

    if (c.status === "Replied") {
      return v22RepliedEmail(c);
    }

    if (c.status === "Nurture") {
      return v22NurtureEmail(c);
    }

    return v22ColdEmail(c);
  }


  function v22WhatsAppDraft(c) {

    const first = v22FirstName(c);
    const name = first ? ` ${first}` : "";
    const product = v22Product(c);

    if (c.status === "Quoted") {
      return `Hi${name}, I was reviewing the quotation again. Is the main point you’re comparing now product cost, freight, specification, or project timing? Once I know that, I can focus on the right part rather than resend the same quote.`;
    }

    if (c.status === "Project") {
      return `Hi${name}, I was reviewing the project again. What is the main item still pending on your side — specification, quantity, material approval, or timing? I can prepare the next step around that.`;
    }

    if (c.status === "Sample") {
      return `Hi${name}, just checking the sample stage. Is anything still needed from my side for shipping or evaluation? If not, I’m happy to give you time to review it.`;
    }

    if (c.status === "Replied") {
      return `Hi${name}, thanks again for your reply. Could you confirm the main application and approximate quantity? I’ll narrow down the most suitable option from there.`;
    }

    const round = v22Round(c);

    if (round <= 1) {
      return `Hi${name}, just following up briefly. Rather than sending a full catalogue, I can narrow the ${product} range down to 3–4 relevant options for a quick look. Would that be useful?`;
    }

    if (round === 2) {
      return `Hi${name}, one practical follow-up from my side. If ${product} is relevant to your sourcing, I can send a short comparison of sizes, thicknesses and lead time instead of more general information.`;
    }

    return `Hi${name}, just a quick update from my side. If you have any current requirement for ${product}, send me the basic specification or quantity and I’ll check the closest suitable option.`;
  }


  function v22LinkedInDraft(c) {

    const first = v22FirstName(c);
    const name = first ? ` ${first}` : "";
    const product = v22Product(c);

    let msg =
      `Hi${name}, rather than sending more general information, I can narrow our ${product} range to a few options relevant to your business. If this category is currently relevant, I’d be happy to send a short selection.`;

    if (c.status === "Quoted") {
      msg =
        `Hi${name}, I was reviewing the quotation again. If you tell me whether the main comparison point is product cost, freight, specification or timing, I can focus on the part that matters rather than resend the same quote.`;
    }

    if (c.status === "Project") {
      msg =
        `Hi${name}, I was reviewing the project notes again. If you let me know the one item still pending — specification, quantity, approval or timing — I can prepare the next step around that.`;
    }

    /*
      Keep LinkedIn message under roughly 300 characters.
    */
    if (msg.length > 295) {
      msg = msg.slice(0, 292) + "...";
    }

    return msg;
  }


  function v22CallDraft(c) {

    const first = v22FirstName(c) || "there";
    const product = v22Product(c);

    return `Hi ${first}, this is Stella from Chameleon Stone.

I’m calling briefly regarding the ${product} information I shared with you.

I don’t want to take much of your time. I mainly wanted to understand whether this material is currently relevant to your sourcing or any active project.

If yes, I can narrow down the next step based on your actual requirement.

If now isn’t a good time, I’m happy to follow up by email.`;
  }


  draft = function (c, channel) {

    if (channel === "WhatsApp") {
      return v22WhatsAppDraft(c);
    }

    if (channel === "LinkedIn") {
      return v22LinkedInDraft(c);
    }

    if (channel === "Call") {
      return v22CallDraft(c);
    }

    return v22EmailDraft(c);
  };


  /*
    Compatibility with the original V1 interface.
  */
  if (typeof generateMessage === "function") {

    generateMessage = function (c, channel) {
      return draft(c, channel);
    };
  }


  /* =====================================================
     7. FOLLOW-UP COMPLETION
  ===================================================== */

  const oldQuickLogV22 =
    typeof quickLog === "function"
      ? quickLog
      : null;


  quickLog = async function (c) {

    const previousRound = v22Round(c);

    /*
      Keep any existing activity-log behavior.
    */
    if (oldQuickLogV22) {

      try {
        await oldQuickLogV22(c);
      } catch (err) {
        console.warn(
          "Original quickLog failed:",
          err
        );
      }
    }


    const newRound =
      previousRound + 1;

    c.followupRound =
      newRound;

    c.followup_round =
      newRound;

    c.lastContact =
      v22Today();


    /*
      Cold-development cadence.
    */
    if (
      c.status === "Developing" ||
      c.status === "Waiting Reply"
    ) {

      c.nextFollowup =
        v22NextDateAfterTouch(
          newRound,
          c.lastContact
        );

    } else if (
      c.status === "Project" ||
      c.status === "Replied"
    ) {

      c.nextFollowup =
        v22AddBusinessDays(
          c.lastContact,
          2
        );

    } else if (
      c.status === "Quoted" ||
      c.status === "Sample"
    ) {

      c.nextFollowup =
        v22AddBusinessDays(
          c.lastContact,
          3
        );

    } else {

      c.nextFollowup =
        v22AddCalendarDays(
          c.lastContact,
          7
        );
    }


    if (typeof persistCustomer === "function") {
      await persistCustomer(c);
    }


    if (typeof renderAll === "function") {
      renderAll();
    }


    const msg =
      `已记录本次跟进。下一次：${c.nextFollowup}`;

    if (typeof showToast === "function") {
      showToast(msg);
    } else if (typeof toast === "function") {
      toast(msg);
    }
  };


  /* =====================================================
     8. CONTACT INFO
     Preserve V2.2 contact visibility
  ===================================================== */

  function v22ExtractContactInfo(c) {

    const notes =
      String(c.notes || "");

    const blocker =
      String(c.blocker || "");

    const all =
      notes + "\n" + blocker;


    function grab(pattern) {

      const re =
        new RegExp(
          "(?:^|\\n)\\s*(?:" +
          pattern +
          ")\\s*[:：]\\s*([^\\n]+)",
          "i"
        );

      const m = all.match(re);

      return m
        ? m[1].trim()
        : "";
    }


    let email =
      grab("Email|邮箱");

    let backupEmail =
      grab(
        "备用Email|Backup\\s*Email|Secondary\\s*Email"
      );


    const emails =
      [
        ...all.matchAll(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
        )
      ].map(m => m[0]);


    if (!email && emails.length) {
      email = emails[0];
    }

    if (
      !backupEmail &&
      emails.length > 1
    ) {
      backupEmail = emails[1];
    }


    let linkedin =
      grab("LinkedIn|领英");

    if (!linkedin) {

      const m =
        all.match(
          /https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/i
        );

      if (m) {
        linkedin = m[0];
      }
    }


    let phone =
      grab(
        "电话\\/WhatsApp|WhatsApp|电话|Phone"
      );

    if (!phone) {

      const m =
        all.match(
          /(?:\+?\d[\d\s().-]{6,}\d)/
        );

      if (m) {
        phone = m[0].trim();
      }
    }


    const route = [];

    if (email) {
      route.push("Email");
    }

    if (phone) {
      route.push(
        /whatsapp/i.test(all)
          ? "WhatsApp / Phone"
          : "Phone"
      );
    }

    if (linkedin) {
      route.push("LinkedIn");
    }


    return {
      email,
      backupEmail,
      linkedin,
      phone,
      route: [...new Set(route)]
    };
  }


  function v22ContactRow(
    label,
    value,
    type
  ) {

    if (!value) return "";

    let action = "";

    if (type === "email") {

      action =
        `<a class="btn ghost"
            href="mailto:${esc(value)}">
          发邮件
        </a>`;

    } else if (
      type === "linkedin" &&
      /^https?:\/\//i.test(value)
    ) {

      action =
        `<a class="btn ghost"
            href="${esc(value)}"
            target="_blank"
            rel="noopener">
          打开
        </a>`;

    } else if (type === "phone") {

      const digits =
        value.replace(
          /[^\d+]/g,
          ""
        );

      if (digits) {

        action =
          `<a class="btn ghost"
              href="tel:${esc(digits)}">
            拨号
          </a>`;
      }
    }


    return `
      <div class="v22-contact-row">
        <div>
          <small>${label}</small>
          <b>${esc(value)}</b>
        </div>
        ${action}
      </div>
    `;
  }


  /* =====================================================
     9. STYLES
  ===================================================== */

  if (
    !document.getElementById(
      "v22SalesStyles"
    )
  ) {

    const st =
      document.createElement("style");

    st.id =
      "v22SalesStyles";

    st.textContent = `

      .v22-contact{
        display:flex;
        flex-direction:column;
        gap:8px
      }

      .v22-contact-row{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        border:1px solid var(--border);
        border-radius:10px;
        padding:10px;
        background:#fafcfd
      }

      .v22-contact-row small{
        display:block;
        color:var(--muted);
        margin-bottom:3px
      }

      .v22-contact-row b{
        font-size:13px;
        word-break:break-all
      }

      .v22-route{
        background:#eef8f3;
        border:1px solid #d3eadf;
        border-radius:10px;
        padding:10px;
        margin-top:8px
      }

      .v22-route strong{
        color:var(--green)
      }

      .v22-round{
        background:#f4f8ff;
        border:1px solid #dce7f5;
        border-radius:10px;
        padding:10px;
        margin-top:8px;
        font-size:12px
      }

      .v22-round b{
        display:block;
        margin-top:3px;
        font-size:14px
      }

    `;

    document.head.appendChild(st);
  }


  /* =====================================================
     10. CUSTOMER DETAIL PAGE
  ===================================================== */

  if (
    typeof openCustomer === "function"
  ) {

    openCustomer = function (id) {

      const c =
        customers.find(
          x => x.id === id
        );

      if (!c) return;


      activeCustomer = c;

      $("modal")
        .classList
        .remove("hidden");


      $("modalTitle")
        .textContent =
        c.company;


      $("modalSub")
        .textContent =
        [
          c.contact,
          c.role,
          c.country
        ]
        .filter(Boolean)
        .join(" · ");


      const ev =
        activities.filter(
          a =>
            a.customer_id === id
        );


      const ai =
        nextStep(c);


      const ci =
        v22ExtractContactInfo(c);


      const contactBlock =
        (
          ci.email ||
          ci.backupEmail ||
          ci.linkedin ||
          ci.phone
        )
        ? `
          <div class="v22-contact">

            ${v22ContactRow(
              "Email",
              ci.email,
              "email"
            )}

            ${v22ContactRow(
              "备用 Email",
              ci.backupEmail,
              "email"
            )}

            ${v22ContactRow(
              "LinkedIn",
              ci.linkedin,
              "linkedin"
            )}

            ${v22ContactRow(
              "电话 / WhatsApp",
              ci.phone,
              "phone"
            )}

          </div>
        `
        : `
          <div class="muted">
            暂未识别到 Email /
            LinkedIn / 电话信息。
          </div>
        `;


      $("modalBody").innerHTML = `

        <div class="detail-grid">

          <div class="stack">

            <div class="card">

              <h3>客户概况</h3>

              <div class="meta">

                ${meta(
                  "状态",
                  c.status
                )}

                ${meta(
                  "优先级",
                  c.priority
                )}

                ${meta(
                  "来源",
                  c.source
                )}

                ${meta(
                  "产品",
                  c.product || "—"
                )}

                ${meta(
                  "最后联系",
                  c.lastContact || "—"
                )}

                ${meta(
                  "下次跟进",
                  v22NormalizeFollowupDate(
                    c.nextFollowup
                  ) || "—"
                )}

              </div>

              <div class="v22-round">

                当前开发轮次

                <b>
                  ${esc(
                    v22RoundLabel(c)
                  )}
                </b>

              </div>

            </div>


            <div class="card">

              <h3>联系方式</h3>

              ${contactBlock}

            </div>


            <div class="card">

              <h3>客户分析</h3>

              <div class="strategy">

                <strong>
                  当前判断：
                </strong>

                ${esc(
                  ai.judgement || ""
                )}

                <br><br>

                <strong>
                  下一步动作：
                </strong>

                ${esc(ai.action)}

                <br>

                <strong>
                  为什么：
                </strong>

                ${esc(ai.reason)}

                <br><br>

                <strong>
                  建议渠道：
                </strong>

                ${esc(
                  ai.channel ||
                  c.source ||
                  "Email"
                )}

                <br>

                <strong>
                  建议跟进日期：
                </strong>

                ${esc(
                  ai.nextDate ||
                  c.nextFollowup ||
                  "未安排"
                )}

              </div>

            </div>


            <div class="card">

              <div class="panel-head">

                <div>
                  <h3>沟通时间线</h3>
                  <p>
                    每次跟进都留下记录
                  </p>
                </div>

                <button
                  id="addActivityBtn"
                  class="btn primary">
                  ＋ 记录沟通
                </button>

              </div>


              <div class="timeline">

                ${
                  ev.length
                    ? ev.map(e => `

                      <div class="event">

                        <div class="event-head">

                          <span class="event-type">
                            ${esc(e.activity_type)}
                            ·
                            ${esc(e.channel || "")}
                          </span>

                          <span class="event-date">
                            ${e.activity_date}
                          </span>

                        </div>

                        <div class="event-note">
                          ${esc(e.note || "")}
                        </div>

                      </div>

                    `).join("")

                    : `
                      <p class="muted">
                        暂无沟通记录。
                      </p>
                    `
                }

              </div>

            </div>


            <div class="card">

              <h3>
                快速起草跟进
              </h3>


              <div class="channel-row">

                <button
                  class="chip"
                  data-ch="Email">
                  Email
                </button>

                <button
                  class="chip"
                  data-ch="WhatsApp">
                  WhatsApp
                </button>

                <button
                  class="chip"
                  data-ch="LinkedIn">
                  LinkedIn
                </button>

                <button
                  class="chip"
                  data-ch="Call">
                  电话脚本
                </button>

              </div>


              <textarea
                id="draftText"
                class="input textarea big"
                placeholder="点击渠道生成英文跟进内容">
              </textarea>


              <div class="row">

                <button
                  id="copyDraft"
                  class="btn primary">
                  复制内容
                </button>

              </div>

            </div>

          </div>


          <div class="stack">

            <div class="card">

              <h3>
                当前动作
              </h3>

              <div
                style="
                  font-size:26px;
                  font-weight:900
                ">
                ${
                  v22NormalizeFollowupDate(
                    c.nextFollowup
                  ) ||
                  "未安排"
                }
              </div>

              <p class="muted">
                下一次跟进日期
              </p>

              <p class="hint">
                ${
                  esc(
                    v22RoundLabel(c)
                  )
                }
              </p>


              <button
                id="logTodayBtn"
                class="btn primary"
                style="width:100%">
                记录今天已跟进
              </button>


              <button
                id="editBtn"
                class="btn ghost"
                style="
                  width:100%;
                  margin-top:8px
                ">
                编辑客户
              </button>

            </div>


            <div class="card">

              <h3>备注</h3>

              <div
                class="muted"
                style="
                  white-space:pre-wrap;
                  line-height:1.6
                ">
                ${esc(
                  c.notes ||
                  "暂无备注"
                )}
              </div>

            </div>

          </div>

        </div>
      `;


      $("editBtn").onclick =
        () => openCustomerForm(c);


      $("addActivityBtn").onclick =
        () => openActivityForm(c);


      $("logTodayBtn").onclick =
        () => quickLog(c);


      document
        .querySelectorAll(
          "[data-ch]"
        )
        .forEach(
          b =>
            b.onclick =
              () => {

                $("draftText").value =
                  draft(
                    c,
                    b.dataset.ch
                  );
              }
        );


      $("copyDraft").onclick =
        async () => {

          await navigator.clipboard
            .writeText(
              $("draftText").value ||
              ""
            );

          if (
            typeof showToast ===
            "function"
          ) {
            showToast("已复制");
          }
        };
    };
  }


  /* =====================================================
     11. COMPATIBILITY WITH ORIGINAL DETAIL PAGE
  ===================================================== */

  if (
    typeof openDetail === "function"
  ) {

    const oldOpenDetailV22 =
      openDetail;


    openDetail =
      function (id) {

        oldOpenDetailV22(id);


        const c =
          customers.find(
            x => x.id === id
          );

        if (!c) return;


        /*
          Replace old customer-facing drafts
          with the professional V2.2 drafts.
        */
        document
          .querySelectorAll(
            "[data-channel]"
          )
          .forEach(
            btn =>
              btn.onclick =
                () => {

                  const el =
                    $("generatedText");

                  if (el) {
                    el.value =
                      draft(
                        c,
                        btn.dataset.channel
                      );
                  }
                }
          );


        /*
          Replace the old fixed "+3 days"
          follow-up behavior.
        */
        const markBtn =
          $("markFollowedBtn");

        if (markBtn) {

          markBtn.onclick =
            async () => {

              await quickLog(c);

              openDetail(c.id);
            };
        }
      };
  }


  /* =====================================================
     12. NORMALIZE WEEKEND DATES ALREADY IN MEMORY
  ===================================================== */

  if (
    typeof customers !== "undefined" &&
    Array.isArray(customers)
  ) {

    customers.forEach(c => {

      if (c.nextFollowup) {

        c.nextFollowup =
          v22NormalizeFollowupDate(
            c.nextFollowup
          );
      }


      if (
        c.followupRound === undefined
      ) {

        c.followupRound =
          v22Round(c);
      }
    });
  }


  /* =====================================================
     13. REFRESH UI
  ===================================================== */

  if (
    typeof renderAll === "function"
  ) {

    try {
      renderAll();
    } catch (err) {
      console.warn(
        "V2.2 initial render:",
        err
      );
    }
  }

/* =========================================================
   V2.2.1 PATCH
   1. Today's Priority = only customers actually due today/overdue
   2. Customers already followed today disappear immediately
   3. Never expose Chinese/internal notes in customer-facing drafts
========================================================= */


/* ---------- SAFE PRODUCT NAME ---------- */

function v221SafeProduct(c) {

  const raw = String(c.product || "").trim();

  if (!raw) {
    return "stone and surface materials";
  }

  const lower = raw.toLowerCase();

  /*
    Extract actual product categories instead of using
    internal notes stored accidentally in the product field.
  */

  if (
    lower.includes("sintered stone") &&
    lower.includes("quartz")
  ) {
    return "stone, quartz and sintered stone";
  }

  if (lower.includes("sintered stone")) {
    return "sintered stone";
  }

  if (
    lower.includes("engineered marble") ||
    lower.includes("artificial marble")
  ) {
    return "engineered marble";
  }

  if (lower.includes("quartz")) {
    return "quartz surfaces";
  }

  if (
    lower.includes("natural stone") ||
    lower.includes("granite") ||
    lower.includes("marble")
  ) {
    return "stone materials";
  }

  /*
    If Chinese characters or obvious internal-action wording
    exist, never send the raw value to the customer.
  */
  if (
    /[\u4e00-\u9fff]/.test(raw) ||
    /确认|采购|样品|报价|跟进|客户|再推/.test(raw) ||
    raw.length > 70
  ) {
    return "stone and surface materials";
  }

  return raw;
}


/* Override the old product helper */
v22Product = function(c) {
  return v221SafeProduct(c);
};


/* ---------- DID WE ALREADY FOLLOW TODAY? ---------- */

function v221FollowedToday(c) {

  const today = v22Today();

  /*
    Fastest check:
    customer last-contact was updated today.
  */
  if (c.lastContact === today) {
    return true;
  }

  /*
    Also inspect activity timeline.
  */
  if (
    typeof activities !== "undefined" &&
    Array.isArray(activities)
  ) {

    return activities.some(a => {

      if (a.customer_id !== c.id) {
        return false;
      }

      const activityDate =
        String(
          a.activity_date ||
          a.date ||
          ""
        ).slice(0, 10);

      return activityDate === today;
    });
  }

  return false;
}


/* ---------- ACTUALLY DUE CUSTOMERS ---------- */

function v221DueCustomers() {

  const today = v22Today();

  return customers
    .filter(c => {

      if (c.status === "Won") {
        return false;
      }

      if (!c.nextFollowup) {
        return false;
      }

      const due =
        v22NormalizeFollowupDate(
          c.nextFollowup
        );

      /*
        Today + overdue are actionable.
      */
      if (due > today) {
        return false;
      }

      /*
        If Stella already followed this customer today,
        it must disappear from Today's Priority.
      */
      if (v221FollowedToday(c)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {

      /*
        1. A before B before C
      */
      const priorityScore = {
        A: 0,
        B: 1,
        C: 2
      };

      const pa =
        priorityScore[a.priority] ?? 3;

      const pb =
        priorityScore[b.priority] ?? 3;

      if (pa !== pb) {
        return pa - pb;
      }

      /*
        2. Project / Quoted / Sample first
      */
      const stageScore = {
        Project: 0,
        Quoted: 1,
        Sample: 2,
        Replied: 3,
        "Waiting Reply": 4,
        Developing: 5,
        Nurture: 6
      };

      const sa =
        stageScore[a.status] ?? 9;

      const sb =
        stageScore[b.status] ?? 9;

      if (sa !== sb) {
        return sa - sb;
      }

      /*
        3. Oldest overdue date first
      */
      return String(
        a.nextFollowup
      ).localeCompare(
        String(b.nextFollowup)
      );
    });
}


/* ---------- OVERRIDE TODAY'S PRIORITY ---------- */

renderPriority = function() {

  const host =
    $("priorityList");

  if (!host) return;

  host.innerHTML = "";

  const allDue =
    v221DueCustomers();

  /*
    Daily execution target remains maximum 30.
    But ONLY genuinely due customers can enter this list.
  */
  const display =
    allDue.slice(0, 30);


  /*
    Update dashboard count.
  */
  const todayCount =
    document.getElementById("v21Today");

  if (todayCount) {
    todayCount.textContent =
      display.length;
  }


  const sDue =
    $("sDue");

  if (sDue) {
    sDue.textContent =
      display.length;
  }


  const label =
    document.createElement("div");

  label.className =
    "v21-mode-label";

  label.textContent =
    `今天必须跟进 · ${display.length} 个`;

  host.appendChild(label);


  if (!display.length) {

    host.insertAdjacentHTML(
      "beforeend",
      `
      <div class="strategy">
        <strong>今天没有到期客户。</strong><br>
        今天已经完成的客户不会继续出现在这里。
        可以把剩余时间用于新客户开发。
      </div>
      `
    );

    return;
  }


  display.forEach(c => {

    const ai =
      nextStep(c);

    const d =
      document.createElement("div");

    d.className =
      "priority";


    const dueDate =
      v22NormalizeFollowupDate(
        c.nextFollowup
      );


    let dateLabel =
      dueDate;

    if (dueDate < v22Today()) {
      dateLabel =
        `${dueDate} · 已逾期`;
    }


    d.innerHTML = `

      <div>

        <div class="company">
          ${esc(c.company)}
        </div>

        <div class="sub">
          ${esc(c.contact || "—")}
          ·
          ${esc(c.country || "")}
        </div>

        <div class="sub">
          ${esc(ai.action)}
        </div>

      </div>

      <div>
        ${badge(c.status)}
      </div>

      <div>
        ${badge(c.priority, c.priority)}
      </div>

      <div>
        ${dateLabel}
      </div>

      <div>›</div>
    `;


    d.onclick =
      () => openCustomer(c.id);


    host.appendChild(d);
  });
};


/* ---------- OVERRIDE TODAY COUNT ---------- */

const v221OldRenderStats =
  renderStats;

renderStats = function() {

  v221OldRenderStats();

  const due =
    v221DueCustomers();

  if ($("sDue")) {
    $("sDue").textContent =
      Math.min(due.length, 30);
  }
};


/* ---------- STRATEGY BOX USES REAL DUE CUSTOMERS ---------- */

renderStrategy = function() {

  const due =
    v221DueCustomers()
      .slice(0, 30);


  const project =
    due.filter(
      c => c.status === "Project"
    ).length;

  const quoted =
    due.filter(
      c => c.status === "Quoted"
    ).length;

  const sample =
    due.filter(
      c => c.status === "Sample"
    ).length;

  const replied =
    due.filter(
      c => c.status === "Replied"
    ).length;

  const waiting =
    due.filter(
      c =>
        c.status ===
        "Waiting Reply"
    ).length;


  if (!$("strategyBox")) {
    return;
  }


  $("strategyBox").innerHTML = `

    <strong>
      今天的执行清单：
    </strong>
    <br>

    今天真正到期且尚未跟进的客户：
    <b>${due.length}</b> 个。

    <br><br>

    Project ${project} 个 ·
    Quoted ${quoted} 个 ·
    Sample ${sample} 个 ·
    Replied ${replied} 个 ·
    Waiting Reply ${waiting} 个。

    <br><br>

    <strong>
      建议顺序：
    </strong>

    先处理项目 / 报价 / 样品客户，
    再处理已回复客户，
    最后处理冷开发等待回复客户。

    <br><br>

    <strong>
      已完成客户：
    </strong>

    今天一旦记录“已跟进”，
    会立即从今日列表移除并进入下一次跟进日期。
  `;
};


/* ---------- AFTER QUICK LOG, REMOVE FROM TODAY IMMEDIATELY ---------- */

const v221QuickLog =
  quickLog;

quickLog = async function(c) {

  await v221QuickLog(c);

  /*
    Ensure today's date is definitely persisted,
    so this customer disappears from Today's Priority.
  */
  c.lastContact =
    v22Today();


  if (
    typeof persistCustomer === "function"
  ) {
    await persistCustomer(c);
  }


  if (
    typeof renderAll === "function"
  ) {
    renderAll();
  }


  /*
    If customer detail is still open,
    refresh the detail panel.
  */
  if (
    typeof openCustomer === "function"
  ) {

    try {
      openCustomer(c.id);
    } catch (_) {}
  }
};


console.log(
  "Stella AI Sales OS V2.2.1 patch loaded."
);
  console.log(
    "Stella AI Sales OS V2.2 loaded successfully."
  );

})();
