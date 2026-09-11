'use client'

import { useEffect } from 'react'
import { Instrument_Serif } from 'next/font/google'
import { faqItems } from './home-faq'
import { mountHome } from './home-behaviour'
import './home.css'

/**
 * The refery.xyz landing page.
 *
 * This domain is the partner front door: scouts, recruiters and recruiting
 * agencies, nobody else. Hiring managers are served by refery.io, and the
 * footer is the only place that says so.
 *
 * The markup is the approved 2026-09-10 mock-up (docs/proposals/2026-09-09-
 * landing-redesign/refery-xyz.html) carried over as-is, so what Lily signed off
 * in the artifact is what ships. Every person and company in the product
 * mock-ups is made up; never put a real client, candidate or scout here.
 *
 * Behaviour (tabs, the pipeline card that moves, the step carousel, counters,
 * the FAQ) is DOM-driven in home-behaviour.js, mounted once. Nothing here
 * re-renders, so React and the script never fight over the same nodes.
 *
 * Light only, on purpose. The page has no dark theme so every visitor sees
 * the same thing.
 */

const serif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
})

export default function HomeClient() {
  useEffect(() => mountHome(), [])

  return (
    <div className={`lp ${serif.variable}`}>
      <nav className="nav">
        <div className="wrap nav-inner">
          <a href="/" className="mark" aria-label="Refery home">Refery<span className="dot">.</span></a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#earn">What you earn</a>
            <a href="#who">Who we place</a>
          </div>
          <div className="nav-right">
            <a href="/auth/login" className="lnk">Sign in</a>
            <a href="/auth/sign-up" className="btn btn-solid btn-sm">Sign up</a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <p className="eyebrow">For scouts, recruiters and agencies</p>
            <h1>You refer the person.<br /><em>We do the rest.</em></h1>
            <p className="lede">Refery is where scouts, recruiters and recruiting agencies introduce people they would vouch for. We bring the clients, the contracts, the invoicing and the guarantee. <b>You bring the person, and keep 70% of the fee.</b></p>
            <div className="cta-row">
              <a href="/auth/sign-up" className="btn btn-solid">Sign up <span className="arr">&rarr;</span></a>
              <a href="#how" className="btn btn-ghost">See how it works</a>
            </div>
            <p className="hero-meta">Takes about three minutes. Already a partner? <a href="/auth/login">Sign in</a>.</p>
          </div>

          <div className="pw" id="pw">
            <div className="pw-tabs" role="tablist">
              <button className="pw-tab on" role="tab" data-p="searches"><b>Searches</b><span>The searches you are on, what moved, and what needs you.</span><div className="bar"><i></i></div></button>
              <button className="pw-tab" role="tab" data-p="pipeline"><b>Pipeline</b><span>Everyone you put forward and exactly where they are.</span><div className="bar"><i></i></div></button>
              <button className="pw-tab" role="tab" data-p="candidates"><b>Candidates</b><span>Your book, graded by us, owned by you.</span><div className="bar"><i></i></div></button>
            </div>

            <div className="win">
              <div className="win-bar"><div className="dots"><i></i><i></i><i></i></div><div className="url" id="pw-url">refery.xyz/searches</div></div>
              <div className="app-bar">
                <span className="s-mark">Refery<span className="dot">.</span></span>
                <a href="#">Start</a><a href="#" data-nav="candidates">Candidates</a><a href="#" className="on" data-nav="searches">Searches</a><a href="#" data-nav="pipeline">Pipeline</a>
                <div className="who"><span>Dana Whitfield</span><span className="pill">Scout</span></div>
              </div>
              <div className="win-body">
              <div className="pw-panels">

                {/* SEARCHES */}
                <div className="pw-panel on" data-p="searches">
                  <div className="main">
                    <div className="main-h"><h4>Searches</h4><span className="sub">2 working at 2 clients &middot; 1 proposed to you &middot; 4 of your candidates in play</span></div>
                    <div className="needs">
                      <div className="am"><i className="dot"></i>1 search is proposed to you. Confirm it if you will work it.<b>Review &rarr;</b></div>
                      <div className="am"><i className="dot"></i>Lena Brandt is missing work authorisation. Ridgeline will ask.<b>Add &rarr;</b></div>
                      <div className="gr"><i className="dot"></i>New read from the hiring manager on Lena Brandt: strong yes.<b>Read &rarr;</b></div>
                    </div>
                    <div className="two-col">
                      <div style={{display:'grid',gap:'16px',minWidth:'0'}}>
                        <div className="oneask">
                          <div className="top">
                            <div>
                              <p className="lbl">Proposed to you</p>
                              <div className="role">Founding Engineer <span className="tag bad">Urgent</span></div>
                              <p className="co">Ridgeline</p>
                              <p className="meta">New York &middot; On-site &middot; Senior &middot; $200,000&ndash;300,000</p>
                              <div className="strip"><i className="now"></i><i></i><i></i><i></i><i></i></div>
                              <div className="stage"><b>Sourcing</b><span>still open for candidates &middot; moved 2d ago</span></div>
                              <p className="why"><b>Why you:</b> three of your last four introductions were New York fintech engineers, and two of them are interviewing there now.</p>
                              <div className="acts"><span className="pbtn primary">I&rsquo;ll work this</span><span className="pbtn">Not for me</span><span className="lbl">Proposed 3d ago &middot; 4 days to answer</span></div>
                            </div>
                            <div className="pay"><div className="figure">$21,000&ndash;31,500</div><p className="lbl">to you on placement &middot; 15% of $200&ndash;300k base &middot; you keep 70%</p></div>
                          </div>
                          <div className="low">
                            <h5>3 people in your book fit this search <span>paired by us, owned by you</span></h5>
                            <div className="mrow"><span className="cb on"></span><div><div className="nm">Lena Brandt <span className="grade a">A</span><span className="ms">82 &middot; strong</span></div><div className="mt">Staff Engineer, Series C payments &middot; New York &middot; 7 yrs</div><div className="rs">Rebuilt the payments ledger at a Series C payments company with a four-person team. Wants a founding seat, not a staff title. Asks $250k, inside the band.</div></div></div>
                            <div className="mrow"><span className="cb"></span><div><div className="nm">Dan Okafor <span className="grade am">A&minus;</span><span className="ms">71 &middot; possible</span></div><div className="mt">Senior Engineer, spend management &middot; Brooklyn &middot; 5 yrs</div><div className="rs">Zero-to-one on a bill-pay product. Strong on Go and Postgres; thinner on infra ownership than the brief asks for.</div></div></div>
                            <div className="sub-btn"><span className="pbtn primary">Submit 1 candidate officially</span></div>
                          </div>
                        </div>

                        <div>
                          <div className="grp"><span className="sq">NA</span>Northwind AI <span>Seed &middot; San Francisco &middot; you are on 1 of 2 searches</span><a href="#">Client brief</a></div>
                          <div className="card wrow">
                            <div><div className="figure" style={{fontSize:'21px'}}>$12,600&ndash;16,800</div><p className="lbl">12% of $150&ndash;200k base &middot; you keep 70%</p></div>
                            <div><div className="ttl">Founding AE <span className="tag amber">Priority</span></div><p className="mt">Northwind AI &middot; San Francisco &middot; On-site &middot; Mid</p><div className="st"><i className="dot" style={{background:'#3F8F73'}}></i>1 sent to client &middot; yours</div></div>
                            <div className="right"><div className="strip"><i className="done"></i><i className="done"></i><i className="now"></i><i></i><i></i></div><span className="pbtn sm">Submit a candidate</span></div>
                          </div>
                        </div>
                      </div>

                      <aside className="rail">
                        <div className="card"><h5>This week</h5><div className="wk">
                          <div><i className="dot" style={{background:'#1F3A2F'}}></i><div><b>Lena Brandt</b> is interviewing at Ridgeline.<span className="t">yesterday</span></div></div>
                          <div><i className="dot" style={{background:'#3F8F73'}}></i><div><b>Tom Adeyemi</b> sent to client &middot; Founding AE at Northwind AI.<span className="t">3 days ago</span></div></div>
                          <div><i className="dot" style={{background:'#C2544B'}}></i><div><b>Sofia Lindqvist</b> is not moving forward at Ferrous. Reason: comp does not fit.<span className="t">5 days ago</span></div></div>
                        </div></div>
                        <div className="card"><h5>Numbers</h5><div className="nums"><div><div className="figure">4</div><p className="lbl">in play</p></div><div><div className="figure">1</div><p className="lbl">interviewing</p></div><div><div className="figure">0</div><p className="lbl">offers out</p></div></div></div>
                        <div className="card" style={{background:'transparent'}}><h5>Know a startup that is hiring?</h5><p style={{fontSize:'12.5px',color:'var(--muted)'}}>Introduce them and earn 10% of the fee on every hire there for 24 months, on top of your placements.</p></div>
                      </aside>
                    </div>
                  </div>
                </div>

                {/* PIPELINE */}
                <div className="pw-panel" data-p="pipeline">
                  <div className="main">
                    <div className="main-h"><h4>Pipeline</h4><span className="sub">6 in play &middot; 1 placed &middot; 2 closed</span></div>
                    <p style={{fontSize:'13.5px',color:'var(--muted)',maxWidth:'70ch'}}>Everyone you have put forward, across every search, and exactly where they are. When something moves, the note that explains it moves with it.</p>
                    <div className="board" id="board">
                      <div className="col"><div className="col-h"><i className="dot" style={{background:'#7C93A8'}}></i>Submitted <span>1</span></div><p className="col-b">With the Refery team for review.</p>
                        <div className="pc"><div className="r1">Elena Vasquez <span className="grade ap">A+</span><span className="age">2h</span></div><div className="r2">Applied AI Engineer &middot; <b>Cobalt Bio</b></div><span className="bd nt">Reading now</span></div>
                      </div>
                      <div className="col"><div className="col-h"><i className="dot" style={{background:'#5E8BA8'}}></i>Shortlisted <span>1</span></div><p className="col-b">We agree. Being packaged for the client.</p>
                        <div className="pc"><div className="r1">Dan Okafor <span className="grade am">A&minus;</span><span className="age">1d</span></div><div className="r2">Founding Engineer &middot; <b>Ridgeline</b></div><span className="bd wa">Add work authorisation</span></div>
                      </div>
                      <div className="col"><div className="col-h"><i className="dot" style={{background:'#3F8F73'}}></i>Sent to client <span id="c3n">2</span></div><p className="col-b">In front of the hiring manager, waiting on their read.</p>
                        <div className="pc"><div className="r1">Tom Adeyemi <span className="grade a">A</span><span className="age">3d</span></div><div className="r2">Founding AE &middot; <b>Northwind AI</b></div><span className="bd nt">Booking link on file</span></div>
                        <div className="pc" id="mover-a"><div className="r1">Lena Brandt <span className="grade a">A</span><span className="age">4d</span></div><div className="r2">Founding Engineer &middot; <b>Ridgeline</b></div><span className="bd hm">HM: strong yes</span></div>
                      </div>
                      <div className="col"><div className="col-h"><i className="dot" style={{background:'#1F3A2F'}}></i>Interviewing <span id="c4n">1</span></div><p className="col-b">In the company&rsquo;s own process.</p>
                        <div className="pc"><div className="r1">Marcus Bell <span className="grade am">A&minus;</span><span className="age">9d</span></div><div className="r2">Enterprise AE &middot; <b>Ferrous</b></div><span className="bd nt">Onsite Thursday</span></div>
                        <div className="pc mover" id="mover-b" hidden><div className="r1">Lena Brandt <span className="grade a">A</span><span className="age">just now</span></div><div className="r2">Founding Engineer &middot; <b>Ridgeline</b></div><span className="bd hm">HM: strong yes</span></div>
                      </div>
                      <div className="col"><div className="col-h"><i className="dot" style={{background:'#8A6A1F'}}></i>Offer <span>0</span></div><p className="col-b">An offer is on the table.</p><div className="pc ghost">Nothing here</div></div>
                      <div className="col"><div className="col-h"><i className="dot" style={{background:'#1F3A2F'}}></i>Placed <span>1</span></div><p className="col-b">Hired. Your payout is on its way.</p>
                        <div className="pc"><div className="r1">Ines Moreau <span className="grade ap">A+</span><span className="age">31d</span></div><div className="r2">Founding Engineer &middot; <b>Ferrous</b></div><span className="bd hm">Starts 6 Oct</span></div>
                      </div>
                    </div>
                    <div className="card" style={{padding:'12px 16px',fontSize:'13px',color:'var(--muted)',display:'flex',gap:'10px',flexWrap:'wrap'}}><b style={{color:'var(--ink)',fontWeight:'600'}}>Closed 2</b> Sofia Lindqvist &middot; Ferrous &middot; not moving forward: comp does not fit <span style={{marginLeft:'auto',color:'var(--faint)'}}>show</span></div>
                  </div>
                </div>

                {/* CANDIDATES */}
                <div className="pw-panel" data-p="candidates">
                  <div className="main">
                    <div className="main-h"><h4>Candidates</h4><span className="sub">Everyone you&rsquo;ve referred or been assigned.</span></div>
                    <div className="ctabs"><span className="on">Everyone <em>14</em></span><span>In review <em>2</em></span><span>Needs you <em>1</em></span><span>Intro sent <em>1</em></span><span>Call booked <em>1</em></span><span>Warm <em>5</em></span><span>Kept for future searches <em>3</em></span><span>Not a fit <em>1</em></span></div>
                    <div className="tool"><div className="inp">Search name, role, skill&hellip;</div><span className="pb">Filters <i>1</i></span><span className="pb">Recent activity</span><span>14 of 14</span></div>
                    <div className="cgrid">
                      <div className="cc"><div className="hd"><span className="av">LB</span><div><div className="nm">Lena Brandt</div><div className="rl">Staff Engineer <span>&middot; Series C payments</span></div></div><span className="grade a">A</span></div><div className="stt"><i className="dot" style={{background:'#1F3A2F'}}></i>In play with companies</div><div className="fx">New York &middot; 7 yrs &middot; <b>$200,000&ndash;240,000</b></div><div className="chips"><span>Go</span><span>Postgres</span><span>Payments</span><span>+4</span></div><div className="ft"><span>Dana Whitfield</span><span>yesterday</span></div></div>
                      <div className="cc"><div className="hd"><span className="av" style={{background:'#F0EAE2',color:'#7A6250'}}>EV</span><div><div className="nm">Elena Vasquez</div><div className="rl">ML Engineer <span>&middot; applied AI lab</span></div></div><span className="grade ap">A+</span></div><div className="stt"><i className="dot" style={{background:'#7C93A8'}}></i>In review</div><div className="fx">San Francisco &middot; 6 yrs &middot; <b>$240,000&ndash;280,000</b></div><div className="chips"><span>PyTorch</span><span>Evals</span><span>Serving</span><span>+6</span></div><div className="ft"><span>Dana Whitfield</span><span>2h ago</span></div></div>
                      <div className="cc"><div className="hd"><span className="av" style={{background:'#E7EDF2',color:'#3F5A70'}}>JL</span><div><div className="nm">Jonas Lindberg</div><div className="rl">Founding AE <span>&middot; security scale-up</span></div></div><span className="grade a">A</span></div><div className="stt"><i className="dot" style={{background:'#C79A2E'}}></i>Needs you</div><div className="fx">San Francisco &middot; 5 yrs &middot; <b>$150,000 + OTE</b></div><div className="chips"><span>Security</span><span>Mid-market</span><span>Outbound</span></div><div className="ft"><span>Dana Whitfield</span><b className="am">Make the intro &rarr;</b></div></div>
                      <div className="cc"><div className="hd"><span className="av" style={{background:'#F2E9EC',color:'#78515C'}}>TA</span><div><div className="nm">Tom Adeyemi</div><div className="rl">AE <span>&middot; spend management</span></div></div><span className="grade a">A</span></div><div className="stt"><i className="dot" style={{background:'#3F8F73'}}></i>In play with companies</div><div className="fx">San Francisco &middot; 4 yrs &middot; <b>$140,000 + OTE</b></div><div className="chips"><span>Fintech</span><span>Founder-led</span><span>SMB</span></div><div className="ft"><span>Dana Whitfield</span><span>3d ago</span></div></div>
                      <div className="cc"><div className="hd"><span className="av" style={{background:'#EDEDE6',color:'#5A5A52'}}>MB</span><div><div className="nm">Marcus Bell</div><div className="rl">Enterprise AE <span>&middot; observability</span></div></div><span className="grade am">A&minus;</span></div><div className="stt"><i className="dot" style={{background:'#1F3A2F'}}></i>In play with companies</div><div className="fx">New York &middot; 8 yrs &middot; <b>$160,000 + OTE</b></div><div className="chips"><span>Enterprise</span><span>Infra</span><span>+2</span></div><div className="ft"><span>Dana Whitfield</span><span>9d ago</span></div></div>
                      <div className="cc"><div className="hd"><span className="av">HK</span><div><div className="nm">Hana Kim</div><div className="rl">Full-stack Engineer <span>&middot; product tooling</span></div></div><span className="grade a">A</span></div><div className="stt"><i className="dot" style={{background:'#5E8571'}}></i>Call booked</div><div className="fx">New York &middot; 3 yrs &middot; <b>$180,000&ndash;200,000</b></div><div className="chips"><span>TypeScript</span><span>React</span><span>Design systems</span></div><div className="ft"><span>Dana Whitfield</span><b>Thu 11 Sep, 15 min</b></div></div>
                    </div>
                  </div>
                </div>

              </div>
              </div>
            </div>
            <p className="illus" style={{marginTop:'12px'}}>Illustrative desk with made-up people and clients.</p>
          </div>
        </div>
      </header>

      <section className="strip-sec">
        <div className="wrap">
          <p className="lbl">Our clients are seed to Series B startups backed by</p>
        </div>
        <div className="wrap"><ul className="logo-grid" aria-label="Investors behind our clients"><li><img alt="Y Combinator" src="/investors/yc.svg" style={{height:'28px'}} /></li><li><img alt="Sequoia" src="/investors/sequoia.svg" style={{height:'18px'}} /></li><li><img alt="a16z" src="/investors/a16z.svg" style={{height:'22px'}} /></li><li className="idx"><img alt="" src="/investors/index.svg" style={{height:'20px'}} /><span>Index Ventures</span></li><li><img alt="General Catalyst" src="/investors/gc.svg" style={{height:'20px'}} /></li><li><img alt="Lightspeed" src="/investors/lightspeed.svg" style={{height:'22px'}} /></li><li><img alt="Founders Fund" src="/investors/ff.svg" style={{height:'15px'}} /></li><li><img alt="Tiger Global" src="/investors/tiger.svg" style={{height:'16px'}} /></li><li><img alt="Insight Partners" src="/investors/insight.svg" style={{height:'34px'}} /></li><li><img alt="Greylock" src="/investors/greylock.svg" style={{height:'24px'}} /></li><li><img alt="DST Global" src="/investors/dst.svg" style={{height:'32px'}} /></li></ul></div>
      </section>

      <section className="sec" id="earn">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="eyebrow">What you earn</p>
            <h2>70% of the fee. <em>Nothing to chase.</em></h2>
            <p className="lede">Each search shows its own fee and your share before you decide. This is the worked example from a real search shape.</p>
          </div>
          <div className="earn">
            <div className="rv">
              <div className="ledger">
                <div className="lr"><span>Founding engineer, San Francisco, base salary</span><b data-count="250000" data-pre="$">$0</b></div>
                <div className="lr"><span>Client fee on that role, 15%</span><b data-count="37500" data-pre="$">$0</b></div>
                <div className="lr total"><span>To you, 70%</span><b data-count="26250" data-pre="$">$0</b></div>
                <p className="fn">Fees are usually 10 to 20% of first-year base and differ by role. Paid once the client has paid us, which under our standard terms is 30 days after the hire starts.</p>
              </div>
              <div className="mail">
                <div className="mh"><span>From Refery &lt;hello@refery.io&gt;</span><b>[Refery] Lena Brandt | hired at Ridgeline</b></div>
                <div className="mb">Ridgeline confirmed it: Lena Brandt accepted the Founding Engineer offer and starts on 6 Oct. <b>Your payout on this one is $26,250.</b> It is paid as soon as the client has paid us, which under our terms is 30 days after Lena starts. Thank you. This is the whole point.</div>
              </div>
            </div>
            <div className="facts rv d2">
              <div><b>A confirmed submission is yours for 24 months</b><span>With that client, in any role. A slow hire is still your hire. First confirmed submission wins.</span></div>
              <div><b>Zero contracts, invoices or clients to win</b><span>Terms are signed and fees agreed before a search reaches you. We invoice, collect and pay your share.</span></div>
              <div><b>The guarantee is ours</b><span>If the hire leaves inside 90 days, we run the replacement search. Not you.</span></div>
              <div><b>Introduce a company, earn on every hire there</b><span>10% of the fee on each placement at a client you brought in, for 24 months, on top of your own placements.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" style={{paddingTop:'0'}}>
        <div className="wrap">
          <div className="sec-head rv">
            <p className="eyebrow">Two ways in</p>
            <h2>Built for people with a network, and for recruiters without a back office.</h2>
          </div>
          <div className="doors">
            <article className="door rv">
              <div className="dt">
                <span className="tag forest" style={{justifySelf:'start'}}>Scouts</span>
                <h3>You are not a recruiter, and that is the point</h3>
                <p>Founders, engineers, operators and investors who know exceptional people and would stake their name on them. Refer someone when the moment is right.</p>
                <ul><li>Introduce someone in a few minutes</li><li>We take it from first call to signed offer</li><li>Paid when they start</li></ul>
              </div>
              <div className="dm"><div className="consent">
                <p className="ey">A quick yes or no</p>
                <h6>Dana Whitfield would like to put you forward for a role</h6>
                <div className="bx"><b>Founding Engineer</b> at a Series A fintech in New York. Nothing about you is shared with the company until you say so, and the company name comes with the first conversation.</div>
                <div className="yn"><span className="pbtn primary hit">Yes, put me forward</span><span className="pbtn">Not right now</span></div>
                <p className="ok">Recorded with the date. Nobody can claim to represent them without their say.</p>
              </div></div>
            </article>
            <article className="door rv d1">
              <div className="dt">
                <span className="tag forest" style={{justifySelf:'start'}}>Recruiting partners</span>
                <h3>Keep the sourcing, drop the business development</h3>
                <p>Recruiters and agencies who are good at finding people and tired of winning clients, negotiating terms and chasing payment. We hold the client relationship. You work the searches.</p>
                <ul><li>Live searches at funded startups</li><li>Terms already signed, fees already agreed</li><li>We invoice, and we carry the guarantee</li></ul>
              </div>
              <div className="dm"><div>
                <p className="lbl">Proposed to you</p>
                <div style={{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'flex-start',flexWrap:'wrap'}}>
                  <div><div style={{fontSize:'18px',fontWeight:'600',letterSpacing:'-0.02em'}}>Applied AI Engineer <span className="tag amber">Priority</span></div><p style={{fontSize:'13.5px',marginTop:'2px'}}>Cobalt Bio</p><p className="lbl">New York &middot; Hybrid &middot; Senior &middot; $220,000&ndash;260,000</p></div>
                  <div style={{textAlign:'right'}}><div className="figure">$15,400&ndash;18,200</div><p className="lbl">to you on placement</p></div>
                </div>
                <div className="strip" style={{maxWidth:'300px',marginTop:'12px'}}><i className="done"></i><i className="now"></i><i></i><i></i><i></i></div>
                <p style={{fontSize:'12.5px',marginTop:'6px'}}><b>Shortlisting</b> <span className="lbl">&middot; Refery has agreed on one candidate</span></p>
                <p style={{fontSize:'13px',color:'var(--ink-2)',marginTop:'12px'}}><b>Why you:</b> you placed two applied-ML engineers into health companies this year.</p>
                <div style={{display:'flex',gap:'8px',marginTop:'12px',alignItems:'center'}}><span className="pbtn primary">I&rsquo;ll work this</span><span className="pbtn">Not for me</span><span className="lbl" style={{marginLeft:'auto'}}>4 days to answer</span></div>
              </div></div>
            </article>
          </div>
        </div>
      </section>

      <section className="sec dark" id="how">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="eyebrow">How it works</p>
            <h2>Three steps, and only the first one is yours.</h2>
          </div>
          <div className="steps">
            <div className="stp" id="stp">
              <button className="on" data-s="1"><span className="k">01</span><div><h3>Introduce someone</h3><p>Add them in the app or email a CV. You do not need an open role: we match people against the searches we are running now and the ones that come next.</p></div></button>
              <button data-s="2"><span className="k">02</span><div><h3>We vet, match and represent</h3><p>Every profile is read. Strong ones go to our talent committee, then to the founders we are hiring for, with the context that makes a founder take the call.</p></div></button>
              <button data-s="3"><span className="k">03</span><div><h3>They start, you get paid</h3><p>We invoice the client and pay your share. If the hire leaves inside 90 days, we run the replacement search, not you.</p></div></button>
            </div>
            <div className="stage-vis">
              <div className="sv on" data-s="1">
                <div className="form">
                  <h6>Add a candidate</h6>
                  <div className="f drop">lena-brandt-cv.pdf<span>PDF only. LinkedIn exports are fine.</span></div>
                  <label>Why they fit <span style={{fontWeight:'400'}}>&middot; optional</span><div className="ta">Rebuilt the payments ledger at a Series C payments company with a four-person team. Wants a founding seat, not a staff title. I was her skip-level for two years<span className="cur"></span></div></label>
                  <label>Have you spoken to them about this search?<div className="pills"><span className="on">Yes, they are interested</span><span>Yes, warm but not pitched</span><span>Not yet</span></div></label>
                  <label>Their consent<div className="pills"><span className="on">Ask them in one tap</span><span>They already said yes</span></div></label>
                  <span className="pbtn primary" style={{justifySelf:'stretch',height:'40px'}}>Submit 1 candidate</span>
                </div>
              </div>
              <div className="sv" data-s="2">
                <div className="slack" id="deskcard">
                  <div className="ch"><b># refery-desk</b><span>Refery Ops</span></div>
                  <div className="msg"><div className="bot">R</div><div>
                    <div className="who">Refery Ops <i>APP</i><span>9:41 AM</span></div>
                    <div className="ln"><b>Lena Brandt</b> &middot; <b>A</b> &middot; referred by Dana Whitfield &middot; scout &middot; 2h to card</div>
                    <div className="ln ctx">Staff Engineer, Series C payments &middot; Columbia &middot; New York &middot; 7 yrs &middot; Citizen &middot; asks $250k &middot; onsite</div>
                    <div className="ln"><b>Panel: Strong &middot; top decile for infra depth.</b> Owned the ledger rewrite end to end and shipped it under a payments audit. Wants zero-to-one and says so without prompting.</div>
                    <div className="live"><b style={{color:'#1D1C1D'}}>Live searches</b><div className="g"><b>Ridgeline &middot; Founding Engineer</b> (New York, Series A, fintech &middot; $200&ndash;300k) &middot; strong</div><div className="y"><b>Cobalt Bio &middot; Applied AI Engineer</b> &middot; possible &middot; thinner on ML serving</div></div>
                    <div className="ln"><b>Suggested: Intro now.</b> Next: a screening call with Lily. Ask: relocation timing.</div>
                    <div className="legend">intro now (sends the email) &middot; bench (sends the note) &middot; not a fit, then one line in the thread &middot; you handle it &middot; a week</div>
                    <div className="rx"><span id="rx-fire">Intro now <b>1</b></span><span>Bench</span><span>Not a fit</span></div>
                    <div className="thread" id="rx-thread"><b>Refery Ops</b> Intro email sent to Dana. <b>Known to you:</b> no call or email on record. Call with Lily proposed for Thu 11 Sep.</div>
                  </div></div>
                </div>
              </div>
              <div className="sv" data-s="3">
                <div className="hire">
                  <div className="track">
                    <div className="tt"><span>Lena Brandt <span className="grade a">A</span></span><span>Founding Engineer &middot; Ridgeline</span></div>
                    <div className="strip"><i className="done"></i><i className="done"></i><i className="done"></i><i className="done"></i><i className="done"></i><i className="now"></i></div>
                    <p className="bl">Placed. Hired. Your payout is on its way.</p>
                    <div className="dates"><span>Starts <b>6 Oct</b></span><span>&middot;</span><span>client invoiced on the start date</span><span>&middot;</span><span>your share follows the client&rsquo;s payment</span></div>
                  </div>
                  <div className="ledger">
                    <div className="lr"><span>Base salary, confirmed by Ridgeline</span><b>$250,000</b></div>
                    <div className="lr"><span>Client fee, 15%</span><b>$37,500</b></div>
                    <div className="lr total"><span>To you, 70%</span><b>$26,250</b></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="split">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="eyebrow">The division of labour</p>
            <h2>The parts of recruiting nobody enjoys are ours.</h2>
            <p className="lede">This is the whole deal in one table. If a line ever moves from the right column to the left, we have broken our side of it.</p>
          </div>
          <div className="cmp rv cmp-wrap"><table>
            <thead><tr><th>The work</th><th>Doing it alone</th><th className="r">With Refery</th></tr></thead>
            <tbody>
              <tr><td>Winning and holding the client</td><td className="y">You</td><td className="r">Refery</td></tr>
              <tr><td>Terms, contracts and the fee negotiation</td><td className="y">You <span className="mut">&middot; weeks per client</span></td><td className="r">Refery <span className="mut">&middot; signed before the search reaches you</span></td></tr>
              <tr><td>Screening, committee calls and references</td><td className="y">You</td><td className="r">Refery</td></tr>
              <tr><td>Presenting the candidate and chasing feedback</td><td className="y">You</td><td className="r">Refery <span className="mut">&middot; the read lands in your Pipeline</span></td></tr>
              <tr><td>Invoicing, collection and your payout</td><td className="y">You <span className="mut">&middot; net 60 if you are lucky</span></td><td className="r">Refery</td></tr>
              <tr><td>The 90-day guarantee, including any replacement search</td><td className="y">You</td><td className="r">Refery</td></tr>
              <tr><td>Knowing someone worth backing</td><td className="y">You</td><td className="y">You</td></tr>
              <tr><td>Making the introduction</td><td className="y">You</td><td className="y">You <span className="mut">&middot; that is the entire list</span></td></tr>
            </tbody>
          </table></div>
        </div>
      </section>

      <section className="sec" id="who" style={{paddingTop:'0'}}>
        <div className="wrap">
          <div className="sec-head rv">
            <p className="eyebrow">Who we place</p>
            <h2>Narrow on purpose, so your introduction actually lands.</h2>
            <p className="lede">Seed to Series B startups, mostly San Francisco and New York, onsite. Knowing what we cannot place is worth as much as knowing what we can.</p>
          </div>
          <div className="who">
            <div className="fitbox rv"><h4>A strong fit</h4><ul>
              <li><span><b>Hands-on builders and sellers</b>, usually two to five years in. Individual contributors, not leadership.</span></li>
              <li><span><b>Ex-founders</b>, founding-team members and early startup operators with clear zero-to-one ownership.</span></li>
              <li><span><b>Engineering:</b> Founding Engineer, AI/ML, Applied AI or Research, Full-Stack, Backend, DevOps, Forward-Deployed.</span></li>
              <li><span><b>GTM:</b> Founding GTM, Founding AE, technical B2B or Enterprise Sales, Account Management.</span></li>
              <li><span><b>In the role&rsquo;s city</b>, or ready to relocate to it.</span></li>
            </ul></div>
            <div className="fitbox no rv d1"><h4>Not right now</h4><ul>
              <li><span>Big-company-only backgrounds with no meaningful startup experience.</span></li>
              <li><span>People who mainly want to manage rather than build.</span></li>
              <li><span>Remote-only candidates.</span></li>
              <li><span>Candidates who need new visa sponsorship.</span></li>
            </ul></div>
          </div>
          <div className="live rv live-wrap">
            <div className="lh">Open on the desk this week <span><i></i>updated hourly &middot; client names open after you sign</span></div>
            <table>
              <thead><tr><th>Search</th><th>Client</th><th>City</th><th>Stage</th><th>To you on placement</th></tr></thead>
              <tbody>
                <tr><td>Founding Engineer</td><td className="m">Series A fintech</td><td className="m">New York</td><td><div className="strip"><i className="now"></i><i></i><i></i><i></i><i></i></div></td><td className="f">$21,000&ndash;31,500</td></tr>
                <tr><td>Applied AI Engineer</td><td className="m">Series A health</td><td className="m">New York</td><td><div className="strip"><i className="done"></i><i className="now"></i><i></i><i></i><i></i></div></td><td className="f">$15,400&ndash;18,200</td></tr>
                <tr><td>Founding AE</td><td className="m">Seed, AI infrastructure</td><td className="m">San Francisco</td><td><div className="strip"><i className="done"></i><i className="done"></i><i className="now"></i><i></i><i></i></div></td><td className="f">$12,600&ndash;16,800</td></tr>
                <tr><td>Forward-Deployed Engineer</td><td className="m">Series B, industrial AI</td><td className="m">San Francisco</td><td><div className="strip"><i className="now"></i><i></i><i></i><i></i><i></i></div></td><td className="f">$16,800&ndash;21,000</td></tr>
                <tr><td>Enterprise AE</td><td className="m">Series B, industrial AI</td><td className="m">New York</td><td><div className="strip"><i className="done"></i><i className="done"></i><i className="done"></i><i className="now"></i><i></i></div></td><td className="f">$11,200&ndash;14,000</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec" style={{paddingTop:'0'}}>
        <div className="wrap" style={{maxWidth:'820px'}}>
          <div className="sec-head rv">
            <p className="eyebrow">Questions</p>
            <h2>The things people ask before signing up.</h2>
          </div>
          <div className="faq rv">{faqItems.map((item, i) => (
              <div className={'faq-item' + (i === 0 ? ' open' : '')} key={item.q}>
                <button className="faq-q" aria-expanded={i === 0} type="button">
                  <span>{item.q}</span>
                  <span className="sign">+</span>
                </button>
                <div className="faq-a"><div><p>{item.a}</p></div></div>
              </div>
            ))}</div>
        </div>
      </section>

      <section className="dark close">
        <div className="wrap close-grid">
          <div className="rv">
            <p className="eyebrow">Get started</p>
            <h2 style={{marginTop:'12px'}}>One introduction is enough to begin.</h2>
            <p style={{marginTop:'16px'}}>Sign up in about three minutes. We review every application by hand and come back to you either way.</p>
            <div className="cta-row" style={{marginTop:'28px'}}><a href="/auth/sign-up" className="btn btn-light">Sign up <span className="arr">&rarr;</span></a><a href="/auth/login" className="btn btn-outline-light">Sign in</a></div>
          </div>
          <div className="final rv d2">
            <div className="r"><span>Placement confirmed</span><b>Founding Engineer &middot; Ridgeline</b></div>
            <div className="r"><span>Introduced by</span><b>Dana Whitfield &middot; scout</b></div>
            <div className="strip"><i className="done"></i><i className="done"></i><i className="done"></i><i className="done"></i><i className="done"></i><i className="now"></i></div>
            <div className="r"><span>Your share, 70% of $37,500</span></div>
            <div className="big" data-count="26250" data-pre="$">$0</div>
            <p className="ft">Introduced 12 Aug &middot; interview 28 Aug &middot; offer accepted 5 Sep &middot; starts 6 Oct &middot; paid once the client pays</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap foot">
          <div className="foot-links"><a href="/partner-terms">Partner terms</a><a href="/privacy">Privacy</a><a href="/partner-guidelines">Guidelines</a><a href="mailto:lily@refery.io">Contact</a></div>
          <div>Refery, Inc. &middot; Hiring for your own team? <a href="https://refery.io" style={{color:'var(--ink)',fontWeight:'600'}}>refery.io</a></div>
        </div>
      </footer>
    </div>
  )
}
