"""Render EcoScan's original 15-second hero from the generated garden artwork.
Usage: python render_hero.py --ffmpeg PATH
Requires FFmpeg with drawtext. No web/backend runtime dependency.
"""
from pathlib import Path
import argparse, subprocess
p=argparse.ArgumentParser()
p.add_argument('--ffmpeg', required=True)
args=p.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/'public'/'media'
out.mkdir(parents=True, exist_ok=True)
font='C\\:/Windows/Fonts/segoeui.ttf'
bold='C\\:/Windows/Fonts/seguisb.ttf'
filters=['scale=1200:800',
         "zoompan=z='1+0.012*sin(on/450*PI)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1200x800:fps=30",
         'drawbox=x=635:y=145:w=520:h=490:color=0xfffaf5@0.94:t=fill']
def txt(text,x,y,size=34,color='0x294832',enable=None,weight=False):
    s=f"drawtext=fontfile='{bold if weight else font}':text='{text}':x='{x}':y='{y}':fontsize={size}:fontcolor={color}"
    if enable:s+=f":enable='{enable}'"
    filters.append(s)
txt('ECOSCAN',680,182,25,weight=True)
txt('EXAMPLE JOURNEY',680,220,19,'0x796766')
for x,y in [(155,135),(575,135),(155,650),(575,650)]:
    filters.append(f"drawbox=x={x}:y={y}:w=35:h=4:color=0x5c8063@0.8:t=fill:enable='lt(t,4)'")
    filters.append(f"drawbox=x={x if x==155 else x+31}:y={y if y==135 else y-31}:w=4:h=35:color=0x5c8063@0.8:t=fill:enable='lt(t,4)'")
txt('____________________',166,"180+390*mod(t,2)/2",37,'0x648e73','lt(t,4)',True)
a='lt(t,4)'
txt('Scan. Then review.',680,280,38,enable=a,weight=True)
txt('One T-shirt suggested',680,352,30,enable=a)
txt('You confirm the item.',680,408,29,enable=a)
txt('Your photo starts the story.',680,530,24,'0x78655e',a)
a='between(t,4,8)'
txt('Understand its impact.',680,280,35,enable=a,weight=True)
txt('5 kg',680,343,83,enable=a,weight=True)
txt('CO2e',905,380,34,enable=a)
txt('Estimated production',680,458,29,enable=a)
txt('Illustrative catalogue value',680,530,24,'0x78655e',a)
a='gte(t,8)'
txt('Give it another wear.',680,280,36,enable=a,weight=True)
txt('If reuse replaces a planned',680,350,27,enable=a)
txt('purchase in this demo...',680,390,27,enable=a)
txt('2.5 kg',680,447,52,enable=a,weight=True)
txt('potentially avoided',865,469,23,enable=a)
filters.append("drawbox=x=680:y=530:w=420:h=62:color=0xf4d5df:t=fill:enable='gte(t,8)'")
txt('+25 demo points',714,541,32,'0x6a3c4f',a,True)
filters.append('drawbox=x=220:y=724:w=760:h=46:color=0xfffaf5@0.94:t=fill')
txt('Example scenario. Not verified carbon savings.',270,733,25,'0x675d58')
filters += ['fade=t=in:st=0:d=0.35:color=0xfffaf5','fade=t=out:st=14.6:d=0.4:color=0xfffaf5']
subprocess.run([args.ffmpeg,'-loglevel','error','-loop','1','-framerate','30','-i',str(root/'media-source'/'ecoscan-garden.png'),'-vf',','.join(filters),'-t','15','-an','-c:v','libx264','-crf','23','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(out/'ecoscan-story.mp4')],check=True)
subprocess.run([args.ffmpeg,'-loglevel','error','-ss','6','-i',str(out/'ecoscan-story.mp4'),'-frames:v','1','-y',str(out/'ecoscan-story-poster.jpg')],check=True)
