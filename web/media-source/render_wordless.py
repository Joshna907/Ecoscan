"""Wordless EcoScan film. Frame-driven 60fps compositing; no text rendering.
pip install pillow imageio-ffmpeg
python render_wordless.py
Original generated asset sheet is preserved. Crops are in-memory video layers.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math, subprocess, argparse
ROOT=Path(__file__).resolve().parents[1]
P=argparse.ArgumentParser(); P.add_argument('--ffmpeg'); P.add_argument('--preview',action='store_true'); args=P.parse_args()
if not args.ffmpeg:
    import imageio_ffmpeg
    args.ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
W,H=1200,800
FPS=60; LENGTH=20
OUT=ROOT/'public/media'; OUT.mkdir(parents=True,exist_ok=True)
sheet=Image.open(ROOT/'media-source/wordless-assets.png').convert('RGBA')
assets=[]
for row in range(2):
    for col in range(3):
        item=sheet.crop((col*512,row*512,(col+1)*512,(row+1)*512))
        # Bounding boxes discard empty margins only; the generated pixels remain unchanged.
        box=item.getchannel('A').point(lambda a: 255 if a>30 else 0).getbbox()
        assets.append(item.crop(box))
def ease(a,b,t):
    v=max(0,min(1,(t-a)/(b-a)))
    return v*v*v*(v*(v*6-15)+10)
def mix(a,b,v):return a+(b-a)*v
def window(a,b,c,d,t):return ease(a,b,t)*(1-ease(c,d,t))
def point(cx,cy,r,angle):return (cx+r*math.cos(angle),cy+r*math.sin(angle))
base=Image.new('RGBA',(W,H),(250,247,240,255))
glow=Image.new('RGBA',(W,H)); g=ImageDraw.Draw(glow)
g.ellipse((-250,300,450,1000),fill=(237,184,205,85))
g.ellipse((900,-200,1500,500),fill=(225,233,204,100))
base=Image.alpha_composite(base,glow.filter(ImageFilter.GaussianBlur(95)))
def sprite(canvas,index,x,y,height,angle=0,opacity=1):
    if opacity<=0.002 or height<2:return
    asset=assets[index]
    size=(max(1,int(height*asset.width/asset.height)),max(1,int(height)))
    im=asset.resize(size,Image.Resampling.LANCZOS).rotate(angle,Image.Resampling.BICUBIC,expand=True)
    if opacity<.999:im.putalpha(im.getchannel('A').point(lambda p:int(p*opacity)))
    canvas.alpha_composite(im,(int(x-im.width/2),int(y-im.height/2)))
def petals(canvas,t):
    # Slow periodic edge motion joins exactly at the loop seam.
    for i in range(12):
        phase=t/20*math.tau+i*2.399
        x=(55 if i%2==0 else 1145)+math.sin(phase)*37
        y=70+(i//2)*130+math.cos(phase)*24
        petal=Image.new('RGBA',(70,100))
        d=ImageDraw.Draw(petal); d.ellipse((19,8,53,85),fill=(235,181+i%3*7,201,100))
        d.arc((20,9,54,86),85,260,fill=(215,153,175,65),width=2)
        petal=petal.rotate(math.sin(phase)*35+i*29,Image.Resampling.BICUBIC,expand=True)
        canvas.alpha_composite(petal,(int(x-petal.width/2),int(y-petal.height/2)))
def cloud(canvas,x,y,size,alpha):
    if alpha<=0:return
    d=ImageDraw.Draw(canvas)
    color=(123,135,128,int(alpha*100))
    for dx,dy,r in [(-.35,.05,.3),(0,-.12,.4),(.37,.04,.28)]:
        d.ellipse((x+(dx-r)*size,y+(dy-r)*size,x+(dx+r)*size,y+(dy+r)*size),fill=color)
def ring(canvas,cx,cy,r,t,opacity):
    if opacity<=0:return
    d=ImageDraw.Draw(canvas)
    for offset in [0,180]:
        start=t*26+offset
        d.arc((cx-r,cy-r,cx+r,cy+r),start,start+132,fill=(91,125,101,int(210*opacity)),width=6)
        theta=math.radians(start+132)
        tip=point(cx,cy,r,theta)
        back=point(cx,cy,r,theta-.09)
        radial=(math.cos(theta)*11,math.sin(theta)*11)
        d.polygon([tip,(back[0]+radial[0],back[1]+radial[1]),(back[0]-radial[0],back[1]-radial[1])],fill=(91,125,101,int(230*opacity)))
def frame(t):
    im=base.copy(); petals(im,t)
    spread=ease(4,6,t)*(1-ease(8,10,t))
    focus=ease(8,10,t)*(1-ease(17,20,t))
    reward=window(12,14,17,19.7,t)
    initial=[(445,340,310,-8),(780,305,330,7),(930,480,270,-7),(440,610,170,5)]
    line=[(265,360,270,0),(490,360,300,0),(725,360,280,0),(960,400,170,0)]
    final=[(490,390,360,0),(1000,240,150,12),(1000,550,155,-10),(230,610,100,-8)]
    # Very soft floating shadows.
    sh=Image.new('RGBA',(W,H)); sd=ImageDraw.Draw(sh)
    for i in range(4):
        x,y,h,a=[mix(initial[i][j],line[i][j],spread) for j in range(4)]
        x,y,h,a=[mix(v,final[i][j],focus) for j,v in enumerate((x,y,h,a))]
        if i:alpha=mix(1,.25,focus)
        else:alpha=1
        sd.ellipse((x-h*.32,y+h*.5+14,x+h*.32,y+h*.5+31),fill=(69,73,56,int(26*alpha)))
    im=Image.alpha_composite(im,sh.filter(ImageFilter.GaussianBlur(14)))
    # Reuse loop behind the retained garment.
    ringlayer=Image.new('RGBA',(W,H)); ring(ringlayer,490,390,235,t,focus)
    im=Image.alpha_composite(im,ringlayer)
    for i in [1,2,3,0]:
        pos=[mix(initial[i][j],line[i][j],spread) for j in range(4)]
        x,y,h,a=[mix(pos[j],final[i][j],focus) for j in range(4)]
        bob=math.sin(t/20*math.tau+i*1.7)
        sprite(im,i,x,y+bob*9,h,a+bob*2,1 if i==0 else mix(1,.3,focus))
    # Outfit scan: four rounded corner brackets and a gently moving light sweep.
    scan=window(0,.6,4,5,t)
    if scan>0:
        layer=Image.new('RGBA',(W,H)); d=ImageDraw.Draw(layer)
        for x,y,dx,dy in [(205,115,1,1),(1060,115,-1,1),(205,710,1,-1),(1060,710,-1,-1)]:
            d.line([(x+dx*35,y),(x,y),(x,y+dy*35)],fill=(73,119,96,int(190*scan)),width=4,joint='curve')
        yy=150+520*ease(.5,3.8,t)
        d.rounded_rectangle((220,yy-12,1045,yy+12),radius=12,fill=(165,198,178,int(55*scan)))
        d.line((220,yy,1045,yy),fill=(91,145,115,int(180*scan)),width=3)
        im=Image.alpha_composite(im,layer)
    # Recognition checks precede estimated footprint clouds.
    checks=window(3.4,4.3,5.2,6,t)
    if checks>0:
        l=Image.new('RGBA',(W,H)); d=ImageDraw.Draw(l)
        for x,y in [(265,535),(490,550),(725,545),(960,520)]:
            d.ellipse((x-17,y-17,x+17,y+17),fill=(96,133,105,int(235*checks)))
            d.line([(x-7,y),(x-2,y+5),(x+8,y-6)],fill=(255,252,244,int(255*checks)),width=3)
        im=Image.alpha_composite(im,l)
    impact=window(5.3,6.4,10.5,12,t)
    l=Image.new('RGBA',(W,H))
    for i,(x,size) in enumerate([(265,55),(490,75),(725,92),(960,65)]):
        cloud(l,mix(x,925,focus),mix(600,360+i*30,focus),size,impact)
    im=Image.alpha_composite(im,l)
    # Leaf tokens move along a curved route into a gift: the demo reward metaphor.
    if focus>0:
        for i in range(3):
            u=max(0,min(1,(t-10.8-i*.55)/3.6))
            a=window(10.6+i*.55,11.1+i*.55,14.3+i*.3,15+i*.3,t)
            x=490+380*u
            y=385-210*math.sin(math.pi*u)
            sprite(im,5,x,y,60+10*math.sin(math.pi*u),-20+u*90,a)
    sprite(im,4,875,440+math.sin(t/20*math.tau)*8,280*ease(12,14,t),-5+math.sin(t)*2,reward)
    return im.convert('RGB')
if args.preview:
    checks=ROOT/'media-source'/'checks'; checks.mkdir(exist_ok=True)
    for t in [1,4,7,10,14,17,19.9]:frame(t).save(checks/f'wordless-check-{t}.jpg',quality=90)
else:
    cmd=[args.ffmpeg,'-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-crf','21','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'ecoscan-wordless.mp4')]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for n in range(FPS*LENGTH):
            proc.stdin.write(frame(n/FPS).tobytes())
            if n%300==0: print(f'Rendered {n}/{FPS*LENGTH} frames',flush=True)
    finally:proc.stdin.close()
    if proc.wait()!=0:raise RuntimeError('Video encoding failed')
    frame(2.4).save(OUT/'ecoscan-wordless-poster.jpg',quality=92)
    print('Finished',flush=True)
