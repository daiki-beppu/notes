import subprocess, math, os
OUT=os.path.dirname(os.path.abspath(__file__))
from PIL import Image, ImageDraw, ImageFont
W,H,FPS=1920,1080,30
SERIF='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
SANSB='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
SANS='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
F=lambda p,s:ImageFont.truetype(p,s,index=0)
CELL=100; BX,BY=110,90  # board top-left
KAN='〇一二三四五六七八九'; ZEN='０１２３４５６７８９'
BG=(28,30,36); WOOD=(222,184,120); LINE=(60,40,20)
# initial position: (file,rank)->(piece, side) side 0=sente 1=gote
board={}
back=['香','桂','銀','金','玉','金','銀','桂','香']
for i,p in enumerate(back):
    f=9-i; board[(f,9)]=(p,0); board[(f,1)]=('王' if p=='玉' else p,1)
for f in range(1,10): board[(f,7)]=('歩',0); board[(f,3)]=('歩',1)
board[(8,8)]=('角',0); board[(2,8)]=('飛',0); board[(2,2)]=('角',1); board[(8,2)]=('飛',1)
# moves: (side, from, to, label, caption, castle?)
M=[
(0,(7,7),(7,6),'▲７六歩','角道を開ける',0),
(1,(3,3),(3,4),'△３四歩','後手も角道を開ける',0),
(0,(2,7),(2,6),'▲２六歩','飛車先の歩を突く',0),
(1,(4,3),(4,4),'△４四歩','角道を止めて振り飛車へ',0),
(0,(2,6),(2,5),'▲２五歩','飛車先をさらに伸ばす',0),
(1,(8,2),(4,2),'△４二飛','四間飛車に振る',0),
(0,(5,9),(6,8),'▲６八玉','玉を左へ。ここから囲いを作る',1),
(1,(5,1),(6,2),'△６二玉','後手は美濃囲いへ',0),
(0,(6,8),(7,8),'▲７八玉','玉の定位置は７八',1),
(1,(6,2),(7,2),'△７二玉','',0),
(0,(7,9),(6,8),'▲６八銀','左の銀を玉の隣へ',1),
(1,(7,2),(8,2),'△８二玉','',0),
(0,(6,9),(7,9),'▲７九金','囲いの要！金を玉の真下へ',1),
(1,(7,1),(7,2),'△７二銀','',0),
(0,(4,9),(5,9),'▲５九金','右の金は５八ではなく５九へ寄る',1),
(1,(6,1),(5,2),'△５二金左','',0),
(0,(5,7),(5,6),'▲５六歩','中央の歩を突く',0),
(1,(9,3),(9,4),'△９四歩','',0),
(0,(3,9),(4,8),'▲４八銀','右の銀を攻めに使う準備',0),
(1,(1,3),(1,4),'△１四歩','',0),
(0,(4,8),(5,7),'▲５七銀右','エルモ囲い完成！（５七銀は攻め駒）',0),
]
CASTLE=[(7,8),(6,8),(7,9),(5,9)]

def sq_xy(f,r): return BX+(9-f)*CELL, BY+(r-1)*CELL
tile_cache={}
def piece_tile(p,side):
    k=(p,side)
    if k in tile_cache: return tile_cache[k]
    s=CELL; im=Image.new('RGBA',(s,s),(0,0,0,0)); d=ImageDraw.Draw(im)
    m=8; poly=[(s/2,m),(s-m-6,m+16),(s-m,s-m),(m,s-m),(m+6,m+16)]
    d.polygon(poly,fill=(246,226,180),outline=(90,60,30),width=3)
    col=(170,20,20) if p in('玉','王') else (20,15,10)
    fnt=F(SERIF,58); bb=d.textbbox((0,0),p,font=fnt)
    d.text(((s-(bb[2]-bb[0]))/2-bb[0],(s-(bb[3]-bb[1]))/2-bb[1]+8),p,font=fnt,fill=col)
    if side==1: im=im.rotate(180)
    tile_cache[k]=im; return im

def draw_board(img,bd,hl_from=None,hl_to=None,moving=None,castle=False):
    d=ImageDraw.Draw(img)
    d.rectangle([BX-20,BY-20,BX+9*CELL+20,BY+9*CELL+20],fill=WOOD)
    for (sq,c) in ((hl_from,(240,210,150)),(hl_to,(255,150,80))):
        if sq:
            x,y=sq_xy(*sq); d.rectangle([x,y,x+CELL,y+CELL],fill=c)
    if castle:
        for sq in CASTLE:
            x,y=sq_xy(*sq); d.rectangle([x,y,x+CELL,y+CELL],fill=(255,205,90))
    for i in range(10):
        d.line([BX+i*CELL,BY,BX+i*CELL,BY+9*CELL],fill=LINE,width=2)
        d.line([BX,BY+i*CELL,BX+9*CELL,BY+i*CELL],fill=LINE,width=2)
    d.rectangle([BX,BY,BX+9*CELL,BY+9*CELL],outline=LINE,width=4)
    for (a,b) in ((3,3),(6,3),(3,6),(6,6)):
        d.ellipse([BX+a*CELL-6,BY+b*CELL-6,BX+a*CELL+6,BY+b*CELL+6],fill=LINE)
    cf=F(SANSB,30)
    for f in range(1,10):
        x,_=sq_xy(f,1); t=ZEN[f]; bb=d.textbbox((0,0),t,font=cf)
        d.text((x+CELL/2-(bb[2]-bb[0])/2-bb[0],BY-62),t,font=cf,fill=(230,230,230))
    for r in range(1,10):
        _,y=sq_xy(1,r); t=KAN[r]; bb=d.textbbox((0,0),t,font=cf)
        d.text((BX+9*CELL+30,y+CELL/2-(bb[3]-bb[1])/2-bb[1]),t,font=cf,fill=(230,230,230))
    for sq,(p,s) in bd.items():
        x,y=sq_xy(*sq); img.paste(t:=piece_tile(p,s),(int(x),int(y)),t)
    if castle:
        for sq in CASTLE:
            x,y=sq_xy(*sq); d.rectangle([x+3,y+3,x+CELL-3,y+CELL-3],outline=(220,40,40),width=6)
    if moving:
        (p,s),(x,y)=moving; t=piece_tile(p,s)
        img.paste(t,(int(x),int(y)),t)

PX=1180
def panel(img,title,move=None,caption='',idx=None,lines=None,castle_flag=False):
    d=ImageDraw.Draw(img)
    d.text((PX,90),title,font=F(SANSB,56),fill=(255,255,255))
    d.line([PX,175,W-80,175],fill=(255,170,80),width=4)
    if idx is not None:
        d.text((PX,205),f'{idx} 手目',font=F(SANS,34),fill=(180,180,190))
    if move:
        col=(255,200,90) if move.startswith('▲') else (150,190,255)
        d.text((PX,260),move,font=F(SANSB,110),fill=col)
        if castle_flag:
            d.rounded_rectangle([PX,410,PX+260,465],radius=12,fill=(200,60,60))
            d.text((PX+20,412),'囲いの手',font=F(SANSB,36),fill=(255,255,255))
        y=500
        for ln in wrap(caption,15):
            d.text((PX,y),ln,font=F(SANSB,46),fill=(240,240,240)); y+=70
    if lines:
        y=230
        for ln in lines:
            fnt=F(SANSB,ln[1]) if isinstance(ln,tuple) else F(SANS,40)
            t=ln[0] if isinstance(ln,tuple) else ln
            col=ln[2] if isinstance(ln,tuple) and len(ln)>2 else (235,235,235)
            d.text((PX,y),t,font=fnt,fill=col); y+=(ln[1]+26 if isinstance(ln,tuple) else 62)
    d.text((PX,H-80),'▲先手（下）  △後手（上）',font=F(SANS,28),fill=(150,150,160))
def wrap(s,n): return [s[i:i+n] for i in range(0,len(s),n)] if s else []

ff=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
  '-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium','-movflags','+faststart',os.path.join(OUT,'elmo.mp4')],stdin=subprocess.PIPE)
def emit(img,n):
    b=img.convert('RGB').tobytes()
    for _ in range(n): ff.stdin.write(b)
def ease(t): return t*t*(3-2*t)

# title card
for i in range(int(FPS*3.5)):
    img=Image.new('RGB',(W,H),BG); draw_board(img,board)
    ov=Image.new('RGBA',(W,H),(0,0,0,170)); img=Image.alpha_composite(img.convert('RGBA'),ov)
    d=ImageDraw.Draw(img); fnt=F(SANSB,120); t='エルモ囲いの組み方'
    bb=d.textbbox((0,0),t,font=fnt); d.text(((W-bb[2]+bb[0])/2,380),t,font=fnt,fill=(255,255,255))
    fnt2=F(SANS,48); t2='対振り飛車・居飛車急戦の定番囲い（例：対四間飛車）'
    bb=d.textbbox((0,0),t2,font=fnt2); d.text(((W-bb[2]+bb[0])/2,560),t2,font=fnt2,fill=(255,200,120))
    emit(img,1); break
emit(img,int(FPS*3.5)-1)

ANIM=int(FPS*0.4)
for n,(side,fr,to,lab,cap,cas) in enumerate(M,1):
    pc=board.pop(fr)
    hold=int(FPS*(1.6 if side==0 else 0.7))
    if not cap: cap='後手は美濃囲いを進める'
    x0,y0=sq_xy(*fr); x1,y1=sq_xy(*to)
    for i in range(ANIM):
        t=ease((i+1)/ANIM)
        img=Image.new('RGB',(W,H),BG)
        draw_board(img,board,fr,to,(pc,(x0+(x1-x0)*t,y0+(y1-y0)*t)))
        panel(img,'エルモ囲いの組み方',lab,cap,n,castle_flag=cas); emit(img,1)
    board[to]=pc
    img=Image.new('RGB',(W,H),BG); draw_board(img,board,fr,to)
    panel(img,'エルモ囲いの組み方',lab,cap,n,castle_flag=cas); emit(img,hold)

# final
img=Image.new('RGB',(W,H),BG); draw_board(img,board,castle=True)
panel(img,'エルモ囲い 完成形',lines=[
  ('玉７八・銀６八・金７九・金５九',42,(255,205,90)),
  '・要は玉の真下の７九金',
  '・金銀３枚がつながって連結がいい',
  '・舟囲いより横からの攻めに強く、',
  '　６九への逃げ道もある',
  '・少ない手数で組めて急戦向き',
  '・弱点：玉頭が薄く、持久戦は苦手',
  ('名前の由来は将棋ソフト「elmo」',32,(170,170,180)),
  ('（2017年 世界コンピュータ将棋選手権 優勝）',30,(170,170,180)),
])
img.save(os.path.join(OUT,'final.png')); emit(img,int(FPS*7))
ff.stdin.close(); ff.wait()
